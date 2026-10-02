#!/usr/bin/env python3
"""Transfer the serving release and data; Terraform owns AWS resource changes."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / '.migration'
SOURCE = 'source-instance'
TARGET = 'candidate-instance'
PROFILE = 'default'
REGION = 'eu-central-1'
STATIC_IP = 'production-ip'
APP = '/opt/money-tracker'
COMPOSE_TEMPLATE = (
    'cd /opt/money-tracker/self-hosting && sudo env IMAGE_TAG=latest '
    'BACKEND_IMAGE_REPOSITORY={backend} '
    'FRONTEND_IMAGE_REPOSITORY={frontend} '
    'docker compose -f docker-compose.yml -f docker-compose.build.yml '
    '-f docker-compose.traefik.yml '
)
COMPOSE = COMPOSE_TEMPLATE.format(backend='backend-image', frontend='frontend-image')


def run(*, command, stdin=None, stdout=None, check=True):
    result = subprocess.run(command, input=stdin, stdout=stdout or subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if check and result.returncode:
        raise RuntimeError(f'{command[0]} failed: {result.stderr.decode(errors="replace")[:1500]}')
    return result


def aws(*, operation, arguments=()):
    result = run(command=['aws', '--profile', PROFILE, '--region', REGION,
                          'lightsail', operation, *arguments, '--output', 'json'])
    return json.loads(result.stdout)


def load_context():
    global SOURCE, TARGET, PROFILE, REGION, STATIC_IP, COMPOSE
    expression = b'jsonencode({source=var.legacy_instance_name,target=var.instance_name,profile=var.aws_profile,region=var.aws_region,static_ip=var.static_ip_name,account=nonsensitive(var.aws_account_id),backend_image=var.backend_image_repository,frontend_image=var.frontend_image_repository})\n'
    encoded = run(command=['terraform', f'-chdir={ROOT}', 'console'], stdin=expression).stdout
    context = json.loads(json.loads(encoded))
    SOURCE, TARGET = context['source'], context['target']
    PROFILE, REGION, STATIC_IP = context['profile'], context['region'], context['static_ip']
    COMPOSE = COMPOSE_TEMPLATE.format(backend=shlex.quote(context['backend_image']), frontend=shlex.quote(context['frontend_image']))
    identity = json.loads(run(command=['aws', '--profile', PROFILE, '--region', REGION, 'sts', 'get-caller-identity', '--output', 'json']).stdout)
    if identity['Account'] != context['account']:
        raise RuntimeError('The AWS CLI identity does not match the Terraform account restriction.')


def host(*, name):
    return aws(operation='get-instance', arguments=['--instance-name', name])['instance']['publicIpAddress']


def ssh_command(*, address, command, key):
    return ['ssh', '-i', str(key), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
            '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={PRIVATE / "known-hosts"}',
            f'ubuntu@{address}', command]


def seed_aws_host_key(*, name, address):
    details = aws(operation='get-instance-access-details', arguments=['--instance-name', name, '--protocol', 'ssh'])['accessDetails']
    records = details.get('hostKeys', [])
    record = next((item for item in records if item['algorithm'] == 'ssh-ed25519'), None)
    if record is None:
        raise RuntimeError('Lightsail has not published the independent SSH host key; source routing is unchanged.')
    encoded = record['publicKey'].split()
    pair = [record['algorithm'], encoded[1] if len(encoded) > 1 else encoded[0]]
    path = PRIVATE / 'host-keys.json'
    keys = json.loads(path.read_text()) if path.exists() else {}
    if name in keys and keys[name] != pair:
        raise RuntimeError('The captured SSH host key differs from the Lightsail control-plane key.')
    keys[name] = pair
    path.write_text(json.dumps(keys, indent=2))
    file = PRIVATE / 'known-hosts'
    file.touch(exist_ok=True)
    run(command=['ssh-keygen', '-R', address, '-f', str(file)], check=False)
    with file.open('a') as output:
        output.write(f'{address} {pair[0]} {pair[1]}\n')


def remember_host_keys(*, source_address, target_address):
    path = PRIVATE / 'host-keys.json'
    if path.exists():
        return
    keys = {}
    for name, address in [(SOURCE, source_address), (TARGET, target_address)]:
        found = run(command=['ssh-keygen', '-F', address, '-f', str(PRIVATE / 'known-hosts')]).stdout.decode().splitlines()
        entries = [line.split() for line in found if line and not line.startswith('#')]
        if not entries:
            raise RuntimeError('A previously verified SSH host key is required for the route transition.')
        keys[name] = entries[0][1:3]
    path.write_text(json.dumps(keys, indent=2))


def pin_route_host_key():
    path = PRIVATE / 'host-keys.json'
    if not path.exists():
        raise RuntimeError('Captured host keys are required before any routing or retirement operation.')
    keys = json.loads(path.read_text())
    if SOURCE not in keys or TARGET not in keys or not (PRIVATE / 'known-hosts').is_file():
        raise RuntimeError('Both instance keys and the pinned migration known-hosts file are required.')
    current = aws(operation='get-static-ip', arguments=['--static-ip-name', STATIC_IP])['staticIp']
    name = current.get('attachedTo')
    if name is None:
        return
    if name not in keys:
        raise RuntimeError('The serving instance has no captured SSH host key.')
    address, pair = current['ipAddress'], keys[name]
    files = {PRIVATE / 'known-hosts', Path(os.environ.get('TMPDIR', '/tmp')) / 'money-tracker-finance-known-hosts', Path('/private/tmp/money-tracker-finance-known-hosts')}
    for file in files:
        if not file.exists():
            continue
        run(command=['ssh-keygen', '-R', address, '-f', str(file)], check=False)
        with file.open('a') as output:
            output.write(f'{address} {pair[0]} {pair[1]}\n')


def ssh(*, address, command, key, check=True):
    return run(command=ssh_command(address=address, command=command, key=key), check=check)


def download(*, address, command, key, destination):
    with destination.open('wb') as output:
        os.chmod(destination, 0o600)
        run(command=ssh_command(address=address, command='bash -o pipefail -c ' + shlex.quote(command), key=key), stdout=output)


def upload(*, address, command, key, source):
    with source.open('rb') as input_file:
        result = subprocess.run(ssh_command(address=address, command='bash -o pipefail -c ' + shlex.quote(command), key=key),
                                stdin=input_file, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f'Transfer failed: {result.stderr.decode(errors="replace")[:1500]}')


def terraform(*, phase):
    if phase != 'stage':
        pin_route_host_key()
    active = 'legacy' if phase in ['stage', 'rollback', 'recover-source'] else 'candidate'
    retain = phase != 'retire'
    plan = ROOT / f'{phase}.tfplan'
    result = run(command=['terraform', f'-chdir={ROOT}', 'plan', '-input=false', '-no-color',
                          f'-var=active_instance={active}', f'-var=retain_legacy={str(retain).lower()}',
                          f'-var=adopt_existing_attachment={str(phase == "stage").lower()}',
                          f'-out={plan}'])
    os.chmod(plan, 0o600)
    (PRIVATE / f'{phase}-plan.txt').write_bytes(result.stdout)
    data = json.loads(run(command=['terraform', f'-chdir={ROOT}', 'show', '-json', str(plan)]).stdout)
    allowed = {
        'stage': {'aws_lightsail_instance.candidate': [['create']], 'aws_lightsail_instance_public_ports.candidate': [['create']]},
        'cutover': {'aws_lightsail_static_ip_attachment.production': [['delete', 'create'], ['create']]},
        'rollback': {'aws_lightsail_static_ip_attachment.production': [['delete', 'create'], ['create']]},
        'recover-source': {'aws_lightsail_static_ip_attachment.production': [['delete', 'create'], ['create']]},
        'recover-candidate': {'aws_lightsail_static_ip_attachment.production': [['delete', 'create'], ['create']]},
        'retire': {'aws_lightsail_instance.legacy[0]': [['delete']]},
    }[phase]
    changes = []
    for item in data.get('resource_changes', []):
        actions = item['change']['actions']
        if actions == ['no-op']:
            continue
        if actions not in allowed.get(item['address'], []):
            raise RuntimeError(f'Unexpected Terraform action: {item["address"]} {actions}')
        changes.append({'resource': item['address'], 'actions': actions})
    print('Terraform changes:', json.dumps(changes), flush=True)
    applied = run(command=['terraform', f'-chdir={ROOT}', 'apply', '-input=false', '-no-color', str(plan)])
    (PRIVATE / f'{phase}-apply.txt').write_bytes(applied.stdout)
    (ROOT / 'production.auto.tfvars.json').write_text(json.dumps({'active_instance': active, 'retain_legacy': retain, 'adopt_existing_attachment': False}, indent=2) + '\n')
    if phase != 'stage':
        pin_route_host_key()


def manifest(*, address, key):
    containers = "$(sudo docker ps -aq --filter label=com.docker.compose.project=budget-tracker-prod)"
    images = ssh(address=address, command="sudo docker inspect --format '{{.Config.Image}}' " + containers, key=key).stdout.decode().splitlines()
    raw_mounts = ssh(address=address, command="sudo docker inspect --format '{{json .Mounts}}' " + containers, key=key).stdout.decode().splitlines()
    mounts = [json.loads(row) for row in raw_mounts]
    volumes = sorted({m['Name'] for row in mounts for m in row if m['Type'] == 'volume'})
    if len(images) != 6 or len(volumes) != 5:
        raise RuntimeError('Expected the six-container stack and five persistent volumes; inspect before migrating.')
    if any(not re.fullmatch(r'budget-tracker-prod_[a-z0-9_]+', v) for v in volumes):
        raise RuntimeError('Unexpected volume name.')
    if any(m['Type'] == 'bind' and m['Source'] != '/var/run/docker.sock' for row in mounts for m in row):
        raise RuntimeError('Bind-mounted application data needs an explicit transfer plan.')
    sha = ssh(address=address, command=f'sudo git -C {APP} rev-parse HEAD', key=key).stdout.decode().strip()
    identities = ssh(address=address, command='sudo docker inspect --format \'{{index .Config.Labels "com.docker.compose.service"}}|{{.Image}}\' ' + containers, key=key).stdout.decode().splitlines()
    service_images = dict(row.split('|', 1) for row in identities)
    if set(service_images) != {'backend', 'frontend', 'db', 'redis', 'traefik', 'currency-rates-api'}:
        raise RuntimeError('Unexpected service identity set.')
    return {'images': sorted(set(images)), 'volumes': volumes, 'release': sha, 'service_images': service_images}


def validate_transfer(*, details, source_address, target_address, key):
    if not isinstance(details, dict) or not re.fullmatch(r'[0-9a-f]{40}', details.get('release', '')):
        raise RuntimeError('Invalid release manifest.')
    for field, count in [('images', 6), ('volumes', 5)]:
        values = details.get(field)
        if not isinstance(values, list) or len(values) != count or any(not isinstance(value, str) for value in values):
            raise RuntimeError('Invalid transfer manifest.')
    if any(not re.fullmatch(r'budget-tracker-prod_[a-z0-9_]+', value) for value in details['volumes']):
        raise RuntimeError('Invalid transfer volume name.')
    source = manifest(address=source_address, key=key)
    target = manifest(address=target_address, key=key)
    for field in ['release', 'images', 'volumes']:
        if source[field] != details[field] or target[field] != details[field]:
            raise RuntimeError(f'Transfer identity mismatch: {field}. Restage before proceeding.')
    if not isinstance(details.get('service_images'), dict) or source['service_images'] != details['service_images'] or target['service_images'] != details['service_images']:
        raise RuntimeError('Source and target service image IDs differ.')


def verification(*, kind, details):
    record = json.loads((PRIVATE / f'{kind}-verification.json').read_text())
    expected_ip = host(name=TARGET)
    if record.get('passed') is not True or record.get('release') != details['release'] or record.get('instance_name') != TARGET or record.get('ip') != expected_ip:
        raise RuntimeError('Verification must match the exact candidate release, instance, and current IP.')
    age = time.time() - record.get('checked_at', 0)
    if not 0 <= age <= 3600:
        raise RuntimeError('Verification is missing or older than one hour.')


def recover_service(*, key, fallback):
    attached = aws(operation='get-static-ip', arguments=['--static-ip-name', STATIC_IP])['staticIp'].get('attachedTo')
    if attached is None:
        address = host(name=fallback)
        seed_aws_host_key(name=fallback, address=address)
        ssh(address=address, command=COMPOSE + 'up -d --no-build --pull never', key=key)
        wait_for_stack(address=address, key=key)
        terraform(phase='recover-source' if fallback == SOURCE else 'recover-candidate')
        attached = aws(operation='get-static-ip', arguments=['--static-ip-name', STATIC_IP])['staticIp'].get('attachedTo')
    if attached not in [SOURCE, TARGET]:
        raise RuntimeError('The production attachment could not be recovered through Terraform.')
    pin_route_host_key()
    address = host(name=attached)
    ssh(address=address, command=COMPOSE + 'up -d --no-build --pull never', key=key)
    wait_for_stack(address=address, key=key)


def wait_for_stack(*, address, key):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        raw = ssh(address=address, command="sudo docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' $(sudo docker ps -aq --filter label=com.docker.compose.project=budget-tracker-prod)", key=key).stdout.decode().splitlines()
        if len(raw) == 6 and all(row in ['running ', 'running healthy'] for row in raw):
            return
        time.sleep(5)
    raise RuntimeError('The six-container stack did not become ready; production routing must not change.')


def check_bank_queue(*, address, key):
    script = "redis=$(sudo docker ps -q --filter label=com.docker.compose.service=redis --filter label=com.docker.compose.project=budget-tracker-prod); test -n \"$redis\"; "
    script += ' '.join(f'sudo docker exec "$redis" redis-cli --raw {kind} bull:account-sync:{name};' for kind, name in [('LLEN', 'wait'), ('LLEN', 'active'), ('ZCARD', 'delayed'), ('ZCARD', 'prioritized')])
    counts = ssh(address=address, command=script, key=key).stdout.decode().splitlines()
    if len(counts) != 4 or any(count != '0' for count in counts):
        raise RuntimeError('Bank sync work is pending/active; finish it before copying the Redis volume.')


def copy_data(*, source_address, target_address, key, details, phase, restart_source):
    archive = PRIVATE / f'{phase}-volumes.tar.gz'
    check_bank_queue(address=source_address, key=key)
    print(f'{phase}: stopping the source stack for a consistent volume backup', flush=True)
    stopped = False
    try:
        stopped = True
        ssh(address=source_address, command=COMPOSE + 'stop --timeout 60 frontend backend', key=key)
        check_bank_queue(address=source_address, key=key)
        ssh(address=source_address, command=COMPOSE + 'stop --timeout 60', key=key)
        if phase in ['cutover', 'rollback']:
            stack_archive = PRIVATE / f'{phase}-stack.tar.gz'
            download(address=source_address, command=f'sudo tar -czf - -C /opt money-tracker', key=key, destination=stack_archive)
            upload(address=target_address, command='sudo tar -xzf - -C /opt', key=key, source=stack_archive)
        members = ' '.join(shlex.quote(v + '/_data') for v in details['volumes'])
        download(address=source_address, command=f'sudo tar -czf - -C /var/lib/docker/volumes {members}', key=key, destination=archive)
    finally:
        if stopped and restart_source:
            ssh(address=source_address, command=COMPOSE + 'up -d --no-build --pull never', key=key)
    with archive.open('rb') as backup_file:
        digest = hashlib.file_digest(backup_file, 'sha256').hexdigest()
    (PRIVATE / f'{phase}-volumes.sha256').write_text(digest + '\n')
    print(f'{phase}: restoring protected volume archive ({archive.stat().st_size} bytes)', flush=True)
    target_compose = COMPOSE + ('-f migration-stage.yml ' if phase == 'stage' else '')
    ssh(address=target_address, command=COMPOSE + 'stop --timeout 60 && ' + target_compose + 'create --no-build --pull never', key=key)
    remote_archive = '/var/tmp/money-tracker-migration-volumes.tar.gz'
    try:
        upload(address=target_address, command=f'sudo sh -c "umask 077; cat > {remote_archive}"', key=key, source=archive)
        remote_digest = ssh(address=target_address, command=f'sudo sha256sum {remote_archive}', key=key).stdout.decode().split()[0]
        if remote_digest != digest:
            raise RuntimeError('Transferred volume archive checksum differs; target data has not been cleared.')
        for volume in details['volumes']:
            path = '/var/lib/docker/volumes/' + volume + '/_data'
            ssh(address=target_address, command=f'sudo find {shlex.quote(path)} -mindepth 1 -delete', key=key)
        ssh(address=target_address, command=f'sudo tar -xzf {remote_archive} -C /var/lib/docker/volumes', key=key)
    finally:
        ssh(address=target_address, command=f'sudo rm -f {remote_archive}', key=key)
    ssh(address=target_address, command=target_compose + 'up -d --no-build --pull never', key=key)
    wait_for_stack(address=target_address, key=key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['stage', 'cutover', 'retire', 'rollback', 'pin-hosts'])
    parser.add_argument('--verified', action='store_true', help='Confirm separate endpoint and MCP verification before cutover/retirement.')
    args = parser.parse_args()
    if args.phase in ['cutover', 'retire'] and not args.verified:
        parser.error('This phase requires --verified after the corresponding endpoint checks.')
    os.umask(0o077)
    PRIVATE.mkdir(exist_ok=True, mode=0o700)
    os.chmod(PRIVATE, 0o700)
    load_context()
    if args.phase == 'pin-hosts':
        stage = json.loads((PRIVATE / 'stage-verification.json').read_text())
        original_ip = aws(operation='get-static-ip', arguments=['--static-ip-name', STATIC_IP])['staticIp']['ipAddress']
        remember_host_keys(source_address=original_ip, target_address=stage['ip'])
        pin_route_host_key()
        print('Pinned the serving IPv4 to the captured instance SSH host key.', flush=True)
        return
    if args.phase == 'retire':
        if not (PRIVATE / 'cutover-complete').exists():
            raise RuntimeError('A completed cutover is required before retirement.')
        details = json.loads((PRIVATE / 'manifest.json').read_text())
        verification(kind='production', details=details)
        attached = aws(operation='get-static-ip', arguments=['--static-ip-name', STATIC_IP])['staticIp'].get('attachedTo')
        if attached != TARGET:
            raise RuntimeError('Production IPv4 must currently route to the verified candidate before retirement.')
    private_key = aws(operation='download-default-key-pair')['privateKeyBase64']
    with tempfile.NamedTemporaryFile(mode='w', dir=PRIVATE, prefix='ssh-key-', delete=False) as file:
        key = Path(file.name)
        file.write(private_key)
    del private_key
    try:
        if args.phase == 'retire':
            target_address = host(name=TARGET)
            seed_aws_host_key(name=TARGET, address=target_address)
            wait_for_stack(address=target_address, key=key)
            terraform(phase='retire')
            print('Retired the imported 2 GB instance; the 1 GB instance and IPv4 remain managed by Terraform.', flush=True)
        elif args.phase == 'stage':
            terraform(phase='stage')
            target_address = host(name=TARGET)
            seed_aws_host_key(name=TARGET, address=target_address)
            deadline = time.monotonic() + 900
            while time.monotonic() < deadline:
                result = ssh(address=target_address, command='test -f /var/lib/money-tracker-host-ready', key=key, check=False)
                if result.returncode == 0:
                    break
                print('Waiting for the IaC host bootstrap...', flush=True)
                time.sleep(15)
            else:
                raise RuntimeError('Host bootstrap did not finish; source is still serving production.')
            source_address = host(name=SOURCE)
            seed_aws_host_key(name=SOURCE, address=source_address)
            details = manifest(address=source_address, key=key)
            (PRIVATE / 'manifest.json').write_text(json.dumps(details, indent=2))
            print('Copying the exact serving release and configuration through SSH', flush=True)
            stack_archive = PRIVATE / 'stack.tar.gz'
            download(address=source_address, command=f'sudo tar -czf - -C /opt money-tracker', key=key, destination=stack_archive)
            upload(address=target_address, command='sudo tar -xzf - -C /opt', key=key, source=stack_archive)
            upload(address=target_address, command='sudo sh -c "umask 077; cat > /opt/money-tracker/self-hosting/migration-stage.yml"', key=key, source=ROOT / 'staging-compose.yml')
            print('Copying only images used by the running containers', flush=True)
            image_archive = PRIVATE / 'images.tar.gz'
            image_names = ' '.join(shlex.quote(i) for i in details['images'])
            download(address=source_address, command=f'sudo docker image save {image_names} | gzip', key=key, destination=image_archive)
            upload(address=target_address, command='gunzip | sudo docker image load', key=key, source=image_archive)
            copy_data(source_address=source_address, target_address=target_address, key=key, details=details, phase='stage', restart_source=True)
            remember_host_keys(source_address=source_address, target_address=target_address)
            (PRIVATE / 'stage-complete').touch()
            print(f'Staged {details["release"]} at {target_address}; production IPv4 still routes to the source.', flush=True)
        else:
            if not (PRIVATE / 'stage-complete').exists():
                raise RuntimeError('A completed stage is required.')
            details = json.loads((PRIVATE / 'manifest.json').read_text())
            source_address, target_address = host(name=SOURCE), host(name=TARGET)
            pin_route_host_key()
            seed_aws_host_key(name=SOURCE, address=source_address)
            seed_aws_host_key(name=TARGET, address=target_address)
            validate_transfer(details=details, source_address=source_address, target_address=target_address, key=key)
            if args.phase == 'cutover':
                verification(kind='stage', details=details)
                try:
                    copy_data(source_address=source_address, target_address=target_address, key=key, details=details, phase='cutover', restart_source=False)
                    terraform(phase='cutover')
                except BaseException:
                    recover_service(key=key, fallback=SOURCE)
                    raise
                (PRIVATE / 'cutover-complete').touch()
                print('Production IPv4 now routes to the 1 GB instance; the source is retained for rollback.', flush=True)
            else:
                if not (PRIVATE / 'cutover-complete').exists():
                    raise RuntimeError('Rollback requires a completed cutover.')
                try:
                    copy_data(source_address=target_address, target_address=source_address, key=key, details=details, phase='rollback', restart_source=False)
                    terraform(phase='rollback')
                except BaseException:
                    recover_service(key=key, fallback=TARGET)
                    raise
                (PRIVATE / 'cutover-complete').unlink(missing_ok=True)
                print('Restored current data and production IPv4 to the 2 GB source.', flush=True)
    finally:
        key.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
