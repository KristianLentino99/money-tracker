#!/usr/bin/env bash
# Bootstraps the production host for finance.kristianlentino.it.
# This runs once as root through Lightsail user data; secrets are generated on
# the host and never stored in this repository or in the user-data payload.
# Lightsail prefixes user data with a POSIX shell fragment, which bypasses this
# file's shebang. Re-exec the complete payload under Bash before using pipefail
# or process substitution.
if [ -z "${BASH_VERSION:-}" ]; then
  exec /bin/bash "$0" "$@"
fi
set -Eeuo pipefail

APP_DOMAIN='finance.kristianlentino.it'
LETSENCRYPT_EMAIL='kristianlentino@gmail.com'
APP_REF='7d2f57936d73288cfe19e837cb0c5cf2617844fb'
APP_DIR='/opt/money-tracker'
LOG_FILE='/var/log/money-tracker-bootstrap.log'

exec > >(tee -a "$LOG_FILE") 2>&1

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
ARCHITECTURE="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
printf '%s\n' \
  "deb [arch=$ARCHITECTURE signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Building the frontend from source can exceed the instance's 2 GB RAM. Swap
# occupies only the included instance disk and is not an AWS backup product.
if ! swapon --show --noheadings | grep -q '^/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$APP_REF"
else
  git clone --depth 1 --branch dev https://github.com/KristianLentino99/money-tracker.git "$APP_DIR"
  git -C "$APP_DIR" fetch --depth 1 origin "$APP_REF"
fi
git -C "$APP_DIR" checkout --detach "$APP_REF"

umask 077
cd "$APP_DIR/self-hosting"
APPLICATION_JWT_SECRET="$(openssl rand -base64 32)"
APP_SESSION_ID_SECRET="$(openssl rand -base64 32)"
BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
APPLICATION_DB_PASSWORD="$(openssl rand -base64 32)"
cat > .env <<EOF
NODE_ENV=production
BETTER_AUTH_URL=https://${APP_DOMAIN}
AUTH_ORIGIN=https://${APP_DOMAIN}
AUTH_RP_ID=${APP_DOMAIN}
AUTH_RP_NAME=MoneyMatter Finance
APPLICATION_JWT_SECRET=${APPLICATION_JWT_SECRET}
APP_SESSION_ID_SECRET=${APP_SESSION_ID_SECRET}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
APPLICATION_DB_HOST=db
APPLICATION_DB_PORT=5432
APPLICATION_DB_USERNAME=budget_tracker
APPLICATION_DB_PASSWORD=${APPLICATION_DB_PASSWORD}
APPLICATION_DB_DATABASE=budget_tracker
APPLICATION_DB_DIALECT=postgres
APPLICATION_REDIS_HOST=redis
APPLICATION_HOST=0.0.0.0
APPLICATION_PORT=8081
SYSTEM_DEMO_DISABLED=true
# The 2 GB Lightsail plan is enough at runtime; Vite's source build needs a
# larger temporary V8 heap. The instance's 2 GB swap absorbs that peak.
FRONTEND_BUILD_NODE_OPTIONS=--max-old-space-size=3072
SELFHOST_FRONTEND_DOMAIN=${APP_DOMAIN}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
EOF

docker compose -f docker-compose.yml -f docker-compose.build.yml -f docker-compose.traefik.yml up -d --build

# Avoid leaving build cache on a small boot disk. Persistent volumes and images
# currently used by the running stack are retained.
docker builder prune --force
docker image prune --force
