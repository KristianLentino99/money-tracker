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
`lightsail:DownloadDefaultKeyPair`, Docker, and access to the repository's
`origin`. Runtime application secrets remain only in
`/opt/money-tracker/self-hosting/.env` on the server.

Optional overrides:

```bash
FINANCE_AWS_REGION=eu-central-1 \
FINANCE_HOST=18.153.188.35 \
./scripts/deploy-finance.sh
```
