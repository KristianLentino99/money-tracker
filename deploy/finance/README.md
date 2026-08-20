# Finance deployment

`finance.kristianlentino.it` runs on the existing Lightsail instance
`money-tracker-finance-prod` in `eu-central-1`. The instance is intentionally
the inexpensive 2 GB plan; database backups are **not** scheduled.

Deploy a revision already pushed to `origin/dev` with:

```bash
./scripts/deploy-finance.sh
```

The script checks out the exact current `origin/dev` revision in an isolated
local worktree, builds `linux/amd64` backend and frontend images on the local
machine, downloads the Lightsail SSH key only into a temporary file, streams
the images directly to the server, then starts the Compose stack without a
server-side build. Its images are named `money-tracker-finance-*` locally on
both machines; it neither pushes to nor pulls from `letehaha`'s Docker Hub
repositories. It refuses to deploy if `origin/dev` changes during the build or
if the server has tracked source edits.

For this already-provisioned host only, its initial bootstrap edits are now
tracked by the first Finance release. Use this one-time migration command:

```bash
FINANCE_ALLOW_REMOTE_DIRTY=1 ./scripts/deploy-finance.sh
```

Do not use that override for unknown server-side edits: the normal command
intentionally refuses to overwrite them.

The frontend build receives `--max-old-space-size=3072` automatically. If the
local Docker VM is deliberately capped below 3 GB, raise its memory allocation
instead of reducing the heap; Vite's typecheck/build needs that headroom.

No additional secret needs to be added to the repository. The machine running
the command needs an authenticated AWS CLI profile allowed to call
`lightsail:DownloadDefaultKeyPair` and `secretsmanager:GetSecretValue`, Docker,
and access to the repository's `origin`. Runtime application secrets remain
only in `/opt/money-tracker/self-hosting/.env` on the server.

## Google OAuth credentials

Do not put `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` in this repository,
GitHub Actions variables copied into files, or
`deploy/aws/lightsail-user-data.sh`. Lightsail user-data is available through
the instance metadata service, so it is not a suitable secret store.

Create or update the AWS Secrets Manager secret from the terminal. The script
prompts for both values without echoing the client secret, uses a temporary
`0600` JSON file, and uploads it with the AWS CLI `file://` syntax:

```bash
./scripts/setup-finance-google-secret.sh
```

The default region and secret name are `eu-central-1` and
`money-tracker/finance/google-oauth`. Override them if needed:

```bash
FINANCE_AWS_REGION=eu-central-1 \
FINANCE_GOOGLE_OAUTH_SECRET_ID=money-tracker/finance/google-oauth \
./scripts/setup-finance-google-secret.sh
```

The resulting secret has exactly these two keys:

```json
{
  "GOOGLE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "your-client-secret"
}
```

The deployment script uses the local AWS CLI identity to read that secret,
streams it to the server over SSH stdin, writes the two values into the
root-only `.env` file, and removes the temporary server-side JSON file when
the deployment exits. It then restarts the backend so the credentials become
available to the running container.

The AWS identity used for deployment should have only this additional
permission, scoped to the one secret (replace `<ACCOUNT_ID>`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:eu-central-1:<ACCOUNT_ID>:secret:money-tracker/finance/google-oauth-*"
    }
  ]
}
```

After creating the secret, deploy normally:

```bash
./scripts/deploy-finance.sh
```

To use a different secret name:

```bash
FINANCE_GOOGLE_OAUTH_SECRET_ID=money-tracker/finance/google-oauth \
./scripts/deploy-finance.sh
```

For a deployment that intentionally does not synchronize Google OAuth, use
`FINANCE_SYNC_GOOGLE_OAUTH=0`. The default is `1`, so a missing or malformed
secret stops the deployment before the new release is activated.

Optional overrides:

```bash
FINANCE_AWS_REGION=eu-central-1 \
FINANCE_HOST=18.153.188.35 \
./scripts/deploy-finance.sh
```
