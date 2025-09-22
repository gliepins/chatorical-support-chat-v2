# Operations — Support Chat v2

This document contains system-specific operational details and file paths. Keep this document out of public issue descriptions.

## Systemd

- Unit: `support-chat-v2.service`
- Binds to `127.0.0.1:${PORT}` (default 4012)
- Reload after unit changes:
  - `sudo systemctl daemon-reload && sudo systemctl restart support-chat-v2.service`
- Logs:
  - `sudo journalctl -u support-chat-v2.service -n 200 -f`

### Unit file snippet

```
[Service]
EnvironmentFile=/etc/chatorical/support-chat-v2.env
WorkingDirectory=/home/ubuntu/v2-support-chat
ExecStart=/usr/bin/node /home/ubuntu/v2-support-chat/dist/index.js
```

After changes:

- `sudo systemctl daemon-reload && sudo systemctl restart support-chat-v2.service`

## Environment and Secrets

- Env file: `/etc/chatorical/support-chat-v2.env` (mode 600, owned by root)
- Secrets directory: `/etc/chatorical/secrets/` (mode 700 dir, 600 files)
  - `/etc/chatorical/secrets/s2s_token`
  - `/etc/chatorical/secrets/conversation_jwt_secret`
  - `/etc/chatorical/secrets/kms_master_key`

These paths are loaded by `src/config/env.ts`. Do not store secret values in the repo.

## Expected envs in /etc/chatorical/support-chat-v2.env

- `PORT`, `BIND_HOST`, `NODE_ENV`
- `DATABASE_URL`
- `REDIS_URL`, `REDIS_KEY_PREFIX`
- `FEATURE_REDIS_PUBSUB`, `LOG_PRETTY`, `LOG_LEVEL`
- `PUBLIC_ORIGIN`, `ALLOWED_ORIGINS`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (optional), `OTEL_SERVICE_NAME` (optional)

## Deployment notes

- Ensure Postgres and Redis are reachable from the host
- Populate secret files with strong random values
- Confirm readiness: `curl -s http://127.0.0.1:4012/ready`
- CI runs full smoke/E2E tests on push/PR
- Release workflow should: build, run Prisma migrations, restart the service
