#!/usr/bin/env bash
# Deploy the exact tip of origin/dev to finance.kristianlentino.it.
#
# The production Lightsail instance deliberately uses the inexpensive 2 GB
# plan. Building the frontend there can exhaust memory, so this script builds
# linux/amd64 images locally and streams them directly to the server. No image
# registry, CI runner or AWS service is added (and therefore no extra cost).
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly AWS_REGION="${FINANCE_AWS_REGION:-eu-central-1}"
readonly FINANCE_HOST="${FINANCE_HOST:-18.153.188.35}"
readonly FINANCE_USER="${FINANCE_USER:-ubuntu}"
readonly APP_DIR="${FINANCE_APP_DIR:-/opt/money-tracker}"
readonly REMOTE="${FINANCE_USER}@${FINANCE_HOST}"
readonly ALLOW_REMOTE_DIRTY="${FINANCE_ALLOW_REMOTE_DIRTY:-0}"
readonly GOOGLE_OAUTH_SECRET_ID="${FINANCE_GOOGLE_OAUTH_SECRET_ID:-money-tracker/finance/google-oauth}"
readonly SYNC_GOOGLE_OAUTH="${FINANCE_SYNC_GOOGLE_OAUTH:-1}"
# Vite + vue-tsc exceed Node's ~2 GB default heap on this project. This is used
# only for the local, disposable image build; the runtime containers keep
# Node's normal memory settings. Override only if the build machine has a
# deliberately smaller Docker memory limit.
readonly FRONTEND_BUILD_NODE_OPTIONS="${FINANCE_FRONTEND_BUILD_NODE_OPTIONS:---max-old-space-size=3072}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_command aws
require_command docker
require_command git
require_command gzip
require_command ssh

if [[ "$SYNC_GOOGLE_OAUTH" != '0' && "$SYNC_GOOGLE_OAUTH" != '1' ]]; then
  echo "FINANCE_SYNC_GOOGLE_OAUTH must be 0 or 1" >&2
  exit 1
fi

cd "$REPO_DIR"

# Build a committed, remote-tracked revision in an isolated worktree. This
# means an unrelated local edit (for example package-lock.json) can never leak
# into production, and the compose configuration always matches the images.
git fetch --quiet origin dev
readonly TARGET_SHA="$(git rev-parse origin/dev)"
readonly TARGET_SHORT_SHA="${TARGET_SHA:0:12}"
readonly BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/money-tracker-finance-build.XXXXXX")"
readonly SSH_KEY="$(mktemp "${TMPDIR:-/tmp}/money-tracker-finance-key.XXXXXX")"

cleanup() {
  if [[ "${SYNC_GOOGLE_OAUTH:-0}" == '1' && -n "${REMOTE_GOOGLE_OAUTH_FILE:-}" ]]; then
    # The remote activation script also removes the file. This second cleanup
    # covers failures between the upload SSH session and the activation SSH
    # session, so a transient deployment error cannot leave the secret in /run.
    ssh \
      -i "$SSH_KEY" \
      -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o UserKnownHostsFile="${TMPDIR:-/tmp}/money-tracker-finance-known-hosts" \
      -o ConnectTimeout=20 \
      "$REMOTE" \
      "sudo rm -f -- '$REMOTE_GOOGLE_OAUTH_FILE'" \
      >/dev/null 2>&1 || true
  fi
  rm -f -- "$SSH_KEY"
  git -C "$REPO_DIR" worktree remove --force "$BUILD_DIR" >/dev/null 2>&1 || rm -rf -- "$BUILD_DIR"
}
trap cleanup EXIT

git -C "$REPO_DIR" worktree add --detach --quiet "$BUILD_DIR" "$TARGET_SHA"

# AWS returns the account's Lightsail default SSH key. It is kept in a private
# temporary file for this deployment only and removed by the EXIT trap.
aws lightsail download-default-key-pair \
  --region "$AWS_REGION" \
  --query privateKeyBase64 \
  --output text >"$SSH_KEY"
chmod 600 "$SSH_KEY"

readonly SSH_OPTIONS=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o UserKnownHostsFile="${TMPDIR:-/tmp}/money-tracker-finance-known-hosts"
  -o ConnectTimeout=20
)
readonly BACKEND_IMAGE="money-tracker-finance-backend:finance-${TARGET_SHORT_SHA}"
readonly FRONTEND_IMAGE="money-tracker-finance-frontend:finance-${TARGET_SHORT_SHA}"
readonly REMOTE_GOOGLE_OAUTH_FILE="/run/money-tracker-finance-google-oauth-${TARGET_SHORT_SHA}.json"

FRONTEND_BUILD_OPTIONS=(
  --build-arg "VITE_SENTRY_RELEASE=${TARGET_SHA}"
  --build-arg "FRONTEND_BUILD_NODE_OPTIONS=${FRONTEND_BUILD_NODE_OPTIONS}"
  --build-arg "SENTRY_ORG=${SENTRY_ORG:-}"
  --build-arg "SENTRY_PROJECT=${SENTRY_PROJECT:-}"
)
if [[ -n "${SENTRY_AUTH_TOKEN:-}" ]]; then
  # BuildKit mounts the token only for the frontend build step. It is not a
  # Docker ARG/ENV value and therefore cannot be persisted in image layers.
  FRONTEND_BUILD_OPTIONS+=(--secret "id=sentry_auth_token,env=SENTRY_AUTH_TOKEN")
fi

echo "Building linux/amd64 images for ${TARGET_SHA}..."
docker buildx build \
  --platform linux/amd64 \
  --load \
  --build-arg "SENTRY_RELEASE=${TARGET_SHA}" \
  --file "$BUILD_DIR/self-hosting/backend/Dockerfile" \
  --tag "$BACKEND_IMAGE" \
  "$BUILD_DIR"
docker buildx build \
  --platform linux/amd64 \
  --load \
  "${FRONTEND_BUILD_OPTIONS[@]}" \
  --file "$BUILD_DIR/self-hosting/frontend/Dockerfile" \
  --tag "$FRONTEND_IMAGE" \
  "$BUILD_DIR"

echo "Uploading release images to ${FINANCE_HOST}..."
docker image save "$BACKEND_IMAGE" "$FRONTEND_IMAGE" | gzip | ssh "${SSH_OPTIONS[@]}" "$REMOTE" 'gzip -d | sudo docker image load'

if [[ "$SYNC_GOOGLE_OAUTH" == '1' ]]; then
  echo "Synchronizing Google OAuth credentials from AWS Secrets Manager..."
  # SecretString is streamed through SSH stdin. It is never put in this
  # script's command arguments, repository, or deployment logs.
  aws secretsmanager get-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$GOOGLE_OAUTH_SECRET_ID" \
    --query SecretString \
    --output text |
    ssh "${SSH_OPTIONS[@]}" "$REMOTE" \
      "sudo install -m 600 /dev/stdin '$REMOTE_GOOGLE_OAUTH_FILE'"
fi

echo "Activating ${TARGET_SHORT_SHA} on the server..."
ssh "${SSH_OPTIONS[@]}" "$REMOTE" \
  "TARGET_SHA='$TARGET_SHA' BACKEND_IMAGE='$BACKEND_IMAGE' FRONTEND_IMAGE='$FRONTEND_IMAGE' APP_DIR='$APP_DIR' ALLOW_REMOTE_DIRTY='$ALLOW_REMOTE_DIRTY' SYNC_GOOGLE_OAUTH='$SYNC_GOOGLE_OAUTH' REMOTE_GOOGLE_OAUTH_FILE='$REMOTE_GOOGLE_OAUTH_FILE' bash -s" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

cleanup_google_oauth_secret() {
  if [[ "$SYNC_GOOGLE_OAUTH" == '1' ]]; then
    sudo rm -f -- "$REMOTE_GOOGLE_OAUTH_FILE"
  fi
}
trap cleanup_google_oauth_secret EXIT

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Missing Git checkout at $APP_DIR" >&2
  exit 1
fi

remote_dirty="$(sudo git -C "$APP_DIR" status --porcelain --untracked-files=no)"
if [[ -n "$remote_dirty" && "$ALLOW_REMOTE_DIRTY" != '1' ]]; then
  echo "Refusing to overwrite tracked edits on the production host. Inspect them first, then rerun with FINANCE_ALLOW_REMOTE_DIRTY=1 only when they are expected bootstrap changes." >&2
  exit 1
fi

# Fetch the branch once and assert it is still the revision used for the local
# image build. A concurrent push cannot cause a mixed code/config deployment.
sudo git -C "$APP_DIR" fetch --depth=1 origin dev
if [[ "$(sudo git -C "$APP_DIR" rev-parse FETCH_HEAD)" != "$TARGET_SHA" ]]; then
  echo "origin/dev changed while the images were being built; rerun deployment." >&2
  exit 1
fi
if [[ -n "$remote_dirty" ]]; then
  echo "Replacing approved bootstrap edits with the tracked release revision."
  sudo git -C "$APP_DIR" reset --hard "$TARGET_SHA"
fi
sudo git -C "$APP_DIR" checkout --detach "$TARGET_SHA"

if [[ "$SYNC_GOOGLE_OAUTH" == '1' ]]; then
  if ! sudo test -s "$REMOTE_GOOGLE_OAUTH_FILE"; then
    echo "Google OAuth secret was not transferred to the server." >&2
    exit 1
  fi
  sudo python3 "$APP_DIR/scripts/sync-finance-google-secret.py" \
    "$APP_DIR/self-hosting/.env" < <(sudo cat "$REMOTE_GOOGLE_OAUTH_FILE")
fi

sudo docker tag "$BACKEND_IMAGE" money-tracker-finance-backend:latest
sudo docker tag "$FRONTEND_IMAGE" money-tracker-finance-frontend:latest

cd "$APP_DIR/self-hosting"
COMPOSE=(
  sudo env
  IMAGE_TAG=latest
  BACKEND_IMAGE_REPOSITORY=money-tracker-finance-backend
  FRONTEND_IMAGE_REPOSITORY=money-tracker-finance-frontend
  docker compose
  -f docker-compose.yml
  -f docker-compose.build.yml
  -f docker-compose.traefik.yml
)
"${COMPOSE[@]}" \
  up -d --no-build --remove-orphans

backend_id="$("${COMPOSE[@]}" ps -q backend)"
for _ in {1..30}; do
  if [[ "$(sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$backend_id")" == "healthy" ]]; then
    sudo docker image prune --force >/dev/null
    echo "Deployment complete: $TARGET_SHA"
    exit 0
  fi
  sleep 2
done

echo "Backend did not become healthy; showing service status and logs." >&2
"${COMPOSE[@]}" ps >&2
"${COMPOSE[@]}" logs --tail=100 backend >&2
exit 1
REMOTE_SCRIPT
