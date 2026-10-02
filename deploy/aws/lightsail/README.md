# MoneyMatter Lightsail infrastructure

Terraform owns the production Lightsail instance, complete public firewall rules, existing static IPv4, and its attachment. The migration helper transfers the serving release, private runtime configuration, Docker images, and all five persistent volumes over SSH. It does not create, alter, or delete AWS resources outside Terraform.

The target is Ubuntu 24.04, `micro_3_0` (1 GB RAM, 40 GB SSD, public IPv4) in `eu-central-1a`, at 7 USD/month before taxes. Builds stay on the developer machine through `scripts/deploy.sh`; the production static IPv4 stays the same. The bootstrap installs Docker, configures rotating logs, and provisions 2 GB disk-backed swap. Application secrets are transferred privately, never interpolated into Terraform user data or state.

## Local state

Configure the AWS account restriction, deployment domain, resource names and serving image repositories in the ignored `local.auto.tfvars.json` file, with mode 0600. The account and resource/image names have no defaults: Terraform must receive them explicitly. The local file may also override the AWS profile and region for your deployment. The generic example below contains placeholders, not production values:

```json
{
  "aws_account_id": "123456789012",
  "production_domain": "finance.example.com",
  "legacy_instance_name": "source-instance",
  "instance_name": "candidate-instance",
  "static_ip_name": "production-ip",
  "backend_image_repository": "backend-image",
  "frontend_image_repository": "frontend-image"
}
```

State, saved plans, local variable files, downloaded SSH keys, logs and migration backups are excluded from Git. The provider lock file and `production.auto.tfvars.json` are tracked; the latter contains only routing/retention flags. Never add credentials or identifiers to that tracked file. Do not force-add ignored files. Cost reports and migration evidence belong in the ignored `.migration/` directory.

```sh
terraform -chdir=deploy/aws/lightsail init
python3 deploy/aws/lightsail/migrate.py stage
```

`stage` imports the source instance, static IP and existing attachment, creates the candidate and its firewall, then waits for bootstrap. The source remains the production route. It copies the exact serving Git checkout/configuration and six used image references; it does not build or fetch a different release. A short source interruption is required to archive the five persistent volumes consistently; the source is restarted immediately after creating that archive. The candidate then restores the archive and starts the same release with `OFFLINE_MODE=true` to suppress scheduled jobs during staging. The helper refuses copying an active/pending bank-sync queue. Cutover restores the normal production configuration.

Before cutover, separately verify HTTPS with the existing domain against the candidate's temporary public IP (`curl --resolve`), backend dependency health, MCP metadata/authentication boundary, and memory/swap/container health. The verifier must write `.migration/stage-verification.json` with `passed: true`, the exact `release`, `instance_name`, current candidate `ip`, and `checked_at` (Unix seconds). The record must be at most one hour old. `--verified` alone does not bypass that binding. These endpoint checks do not prove an authenticated MCP tool call; report that distinction explicitly.

```sh
python3 deploy/aws/lightsail/migrate.py cutover --verified
```

`cutover` stops the source, takes a final consistent data archive, stops the candidate, clears only its named volume data directories and restores the final archive. It waits for the candidate containers to become ready before applying the Terraform static-IP attachment replacement. Expect a brief outage while the source is stopped and the IP moves. The source is retained, with its application stopped, until public endpoint/MCP and runtime checks pass.

```sh
python3 deploy/aws/lightsail/migrate.py retire --verified
```

Before retirement, the verifier writes `.migration/production-verification.json` with the same fields, bound to the candidate's production static IPv4. `retire` checks this fresh record, actual static-IP routing and current container health, then removes the imported source instance through Terraform. Both instances incur hourly costs until this phase succeeds. Verify the final Terraform plan has no pending changes. The tracked `production.auto.tfvars.json` records the final desired routing and whether the source is retained. No ongoing paid snapshot/monitoring service is enabled.

## Recovery

Before source retirement:

```sh
python3 deploy/aws/lightsail/migrate.py rollback
```

After a completed cutover, rollback transfers the candidate's current data and configuration back to the source before changing the static-IP attachment. It therefore requires a source still present, the exact staged service image IDs/volumes/release, and working SSH access. Cutover also re-copies the quiesced source configuration, preventing staged credentials from becoming stale. The target's transferred volume archive must pass a SHA256 check before its volume contents are cleared. If a route switch fails after detaching the IP, the helper attempts one scoped Terraform attachment recreation to the phase's serving fallback; the adoption import is disabled after the initial stage so detached attachments can be recreated. Recovery after retirement requires provisioning another instance and restoring the private archives; it is not the same operation as rollback.

Protected local artifacts live in `deploy/aws/lightsail/.migration/` (directory mode 0700, files 0600), including `stack.tar.gz` with runtime secrets/TLS state, `images.tar.gz`, `stage-volumes.tar.gz`, and `cutover-volumes.tar.gz`. Do not publish this directory or commit its contents. These are local migration recovery artifacts, not an automated off-site backup policy. SSH keys are removed at the end of each helper invocation.

The helper rejects unexpected Terraform actions: staging may only create the candidate and its ports; cutover/rollback/recovery may only create or replace the static-IP attachment; retirement may only delete the imported source. Profile, region, names and account restriction are read from the Terraform variable context, and the AWS CLI account must match. It refuses arbitrary bind-mounted application data or a stack that differs from the expected six containers/five volumes. Inspect failures before retrying; do not bypass the guards.

The tool seeds source and candidate SSH public host keys from the authenticated Lightsail control-plane `GetInstanceAccessDetails` metadata and rejects a mismatch with captured keys. SSH uses strict host-key verification, including the initial bootstrap connection. Both captured keys and the migration known-hosts file are required before routing or retirement. Once AWS confirms the serving attachment, the tool pins the matching captured host key for the preserved IPv4 in its migration/deployment known-host files. The `pin-hosts` phase can synchronize these local pins for the completed route; it does not alter AWS resources.

## References

- [Lightsail instance provider resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lightsail_instance)
- [Static IPv4 attachment](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lightsail_static_ip_attachment)
- [Public port rules](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lightsail_instance_public_ports)
