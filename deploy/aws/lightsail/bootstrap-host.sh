#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec /bin/bash "$0" "$@"
fi
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git python3
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
architecture="$(dpkg --print-architecture)"
codename="$(. /etc/os-release && printf '%s' "$VERSION_CODENAME")"
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$architecture" "$codename" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

install -m 0755 -d /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
JSON
systemctl enable --now docker

# Image defaults that do nothing on this Docker host hold ~90 MB of the 1 GB
# plan's RAM and push the application into swap. The SSM agent has no instance
# role on Lightsail and only retries failed registrations; the root disk is a
# single NVMe volume, so multipath is unused; there is no modem, removable
# media, or firmware to update. Masking keeps package upgrades from restarting
# them.
systemctl disable --now snap.amazon-ssm-agent.amazon-ssm-agent.service || true
systemctl disable --now snapd.service snapd.socket snapd.seeded.service \
  multipathd.service multipathd.socket ModemManager.service udisks2.service \
  fwupd-refresh.timer || true
systemctl stop fwupd.service || true
systemctl mask snapd.service snapd.socket multipathd.service multipathd.socket \
  ModemManager.service udisks2.service fwupd.service

fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
touch /var/lib/money-tracker-host-ready
