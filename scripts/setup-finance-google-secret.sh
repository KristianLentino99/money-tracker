#!/usr/bin/env bash
# Create or update the Finance Google OAuth secret in AWS Secrets Manager.
# Values are read interactively and kept only in a 0600 temporary file while
# the AWS CLI uploads them with file://. They are never written to the repo or
# passed as command-line arguments.
set -Eeuo pipefail

readonly AWS_REGION="${FINANCE_AWS_REGION:-eu-central-1}"
readonly SECRET_ID="${FINANCE_GOOGLE_OAUTH_SECRET_ID:-money-tracker/finance/google-oauth}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_command aws
require_command python3

readonly AWS_ARN="$(aws sts get-caller-identity --query Arn --output text)"
if [[ "$AWS_ARN" == arn:aws:iam::*:root ]]; then
  echo "Warning: AWS CLI is authenticated as the account root user: $AWS_ARN" >&2
  echo "Use an IAM Identity Center/role or least-privilege IAM user for routine deploys." >&2
fi

read -r -p "Google OAuth client ID: " GOOGLE_CLIENT_ID
read -r -s -p "Google OAuth client secret: " GOOGLE_CLIENT_SECRET
printf '\n'

if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ]]; then
  echo "Both Google OAuth values are required." >&2
  exit 1
fi

umask 077
readonly SECRET_FILE="$(mktemp "${TMPDIR:-/tmp}/money-tracker-google-oauth.XXXXXX")"

cleanup() {
  rm -f -- "$SECRET_FILE"
  unset GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
}
trap cleanup EXIT

export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
python3 - "$SECRET_FILE" <<'PY'
import json
import os
import sys
from pathlib import Path

Path(sys.argv[1]).write_text(
    json.dumps(
        {
            "GOOGLE_CLIENT_ID": os.environ["GOOGLE_CLIENT_ID"],
            "GOOGLE_CLIENT_SECRET": os.environ["GOOGLE_CLIENT_SECRET"],
        },
        separators=(",", ":"),
    ),
    encoding="utf-8",
)
PY
chmod 600 "$SECRET_FILE"

if aws secretsmanager describe-secret \
  --region "$AWS_REGION" \
  --secret-id "$SECRET_ID" \
  >/dev/null 2>&1; then
  VERSION_ID="$(aws secretsmanager put-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$SECRET_ID" \
    --secret-string "file://$SECRET_FILE" \
    --query VersionId \
    --output text)"
  echo "Updated $SECRET_ID in $AWS_REGION (version $VERSION_ID)."
else
  ARN="$(aws secretsmanager create-secret \
    --region "$AWS_REGION" \
    --name "$SECRET_ID" \
    --description 'Google OAuth credentials for MoneyMatter Finance' \
    --secret-string "file://$SECRET_FILE" \
    --query ARN \
    --output text)"
  echo "Created $ARN."
fi
