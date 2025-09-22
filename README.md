# Support Chat v2 — Workspace

This workspace contains the second edition (v2) of Support Chat. The focus is multitenancy, pluggable channels, Redis-backed fan-out and rate limits, robust webhooks, and observability — while preserving v1 compatibility for the default tenant.

## Must‑keep compatibility (v1 parity)

- Keep v1 endpoints working for the default tenant.
- Widget v1 remains unchanged: same WS path and event shapes:
  - `agent_joined`: `{ type: 'agent_joined', agent?: string }`
  - `info_note`: `{ type: 'info_note', key?: string, text: string }`
  - `conversation_closed`: `{ type: 'conversation_closed' }`
  - messages echo: `{ direction: 'INBOUND'|'OUTBOUND', text: string, agent?: string }`
- Telegram parity: claim‑before‑reply, silent notifications by default, topic title updates on rename/note.

## Critical focus areas

- TenantContext everywhere: no DB access without `tenant_id`; enforce in repositories.
- Redis from day 1: WS pub/sub fan‑out and distributed rate limits (per tenant/IP/API key/conversation).
- Secrets handling: per‑tenant encrypted channel configs; no fallback to `SERVICE_TOKEN` for JWT; short‑lived conversation JWTs.
- Webhook robustness: verify header secret; idempotency; respect `retry_after` backoff.
- Event‑driven: emit domain events (Started, Added, Claimed, Closed) + outbox worker with retries.
- Observability: per‑tenant metrics/logs; `request_id`; OpenTelemetry traces; alerts on Telegram/API failures.
- Indexing: add `(tenantId, updatedAt)`, `(tenantId, status)`, `(tenantId, threadId)`, `(tenantId, locale, key)`.

## Project layout (proposed)

```
v2-support-chat/
  documents/
    IMPLEMENTATION_V2.md
    WHITEPAPER_V2.md
  docs/
    HANDOFF_V2.md
  prisma/
    schema.prisma              # multitenant schema (TBD in M2)
  src/
    config/env.ts              # centralized env loader
    telemetry/{logger.ts,metrics.ts,tracing.ts}
    middleware/{requestId.ts,tenantContext.ts,serviceAuth.ts}
    db/client.ts               # Prisma client (singleton)
    repositories/              # tenant‑scoped repositories
    services/
      conversationService.ts   # tenant‑aware
      systemMessages.ts
      events/{eventBus.ts,outbox.ts,worker.ts}
    channels/
      core/ChannelAdapter.ts   # common interface
      telegram/{adapter.ts,webhook.ts}
    ws/{hub.ts,server.ts}      # Redis pub/sub + WS server
    api/
      publicV1.ts              # v1‑compatible routes for default tenant
      adminV1.ts               # legacy admin (service token)
      adminV2.ts               # API‑key scoped admin
    index.ts                   # HTTP/WS bootstrap
  .env.example
  docker-compose.yml
  package.json                 # scripts, deps
  tsconfig.json
  README.md
```

## Environment and operations

Required envs (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `CONVERSATION_JWT_SECRET`, `SERVICE_TOKEN` (legacy admin), `PORT`.

Environment separation
- No v1 data migration required (v1 had no real data).
- Use distinct databases per environment: `support_chat_dev` and `support_chat_prod`.
- Logging policy: dev uses pretty logs; prod uses JSON logs with level from `LOG_LEVEL` (default `info`).
- Use server‑to‑server (S2S) secure tokens from day one; do not store bearer tokens in cookies/localStorage.

Domain
- Public SaaS domain: `chatorical.com`.
- API and widget served via `api.chatorical.com` behind Nginx (TLS at proxy); service binds to `127.0.0.1:${PORT}`.
- Tenant admin access at `https://chatorical.com/admin`; SaaS admin at `https://admin.chatorical.com`.
Required envs (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `CONVERSATION_JWT_SECRET`, `SERVICE_TOKEN` (legacy admin), `PORT`.

Telegram per tenant: `BOT_TOKEN`, `WEBHOOK_SECRET`, optional `TELEGRAM_HEADER_SECRET`, `SUPPORT_GROUP_ID`.

Health checks: `/health` (basic), `/ready` (strict), deep health endpoint parity (start→topic→welcome→token).
Binding: service listens on `BIND_HOST` (default 127.0.0.1) and `PORT` (default 4012).

## Milestones (Definition of Done excerpts)

- M1: Redis pub/sub broadcasting across instances; distributed rate limiting; metrics exposed.
- M2: All read/write paths require TenantContext; cross‑tenant access impossible (tests).
- M3: API keys with scopes; logs include `tenant_id`; default tenant backward compatible.
- M4: Telegram adapter isolated per tenant; inbound routed by secret; retries/backoff implemented.
- M5: Outbox persists side‑effects; worker retries survive restarts; idempotency keys honored.
- M6: Templates and translations scoped to tenant; preview API; fallback works.
- M7: Widget v2 uses tenant bootstrap + short‑lived WS tokens; v1 widget still works.
- M8: Billing webhooks recorded; limits enforced with soft/hard thresholds.
- M9: Per‑tenant dashboards/metrics; audit exports; retention job.

## Next steps

1) Land multitenant schema (M2) and repositories with TenantContext.
2) Add Redis WS hub + rate limiting (M1) with feature flags.
3) Implement channel adapter contract and Telegram adapter re‑wiring (M4).
4) Introduce API keys + admin v2 (M3) while keeping v1 endpoints for default tenant.
5) Wire outbox worker and domain events (M5).

See `documents/IMPLEMENTATION_V2.md` and `docs/HANDOFF_V2.md` for detailed requirements.


