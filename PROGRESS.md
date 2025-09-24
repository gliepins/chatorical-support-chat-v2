## Support Chat v2 — Project Progress

Last updated: 2025-09-24

### Project snapshot

- **Goal**: Multi-tenant support chat service with channel integrations and realtime updates.
- **Tech**: TypeScript, Node.js, WebSocket, Prisma, PostgreSQL, Telegram integration.

### Current components (present in repo)

- **Database and models**
  - `prisma/schema.prisma` — base schema defined
- **Core services**
  - `src/repositories/conversationRepo.ts` — conversation repository
  - `src/services/crypto.ts` — crypto utilities
- **API & middleware**
  - `src/index.ts` — server bootstrap
  - `src/middleware/tenantContext.ts` — tenant context middleware
  - `src/api/adminTest.ts` — admin/test endpoint
- **Channels**
  - `src/channels/telegram/adapter.ts` — Telegram channel adapter
  - `src/channels/telegram/webhook.ts` — Telegram webhook handler
- **Realtime**
  - `src/ws/server.ts` — WebSocket server
  - `src/ws/redisHub.ts` — Redis-backed fan-out with separate pub/sub connections
- **Scripts**
  - `scripts/seedTelegram.js` — seed helper for Telegram
  - `scripts/releaseWidget.js` — generates versioned widget snippet
  - `scripts/runWidgetLocal.js` — local widget server harness

### Milestones

- [x] Initialize project structure and TypeScript setup
- [x] Define Prisma schema and database models (initial)
- [x] Implement conversation repository (initial)
- [x] Add tenant context middleware
- [x] Integrate Telegram channel (adapter + webhook)
- [x] Stand up WebSocket server
- [x] Add admin/test endpoint and basic health checks
- [x] TenantContext enforced across repositories/controllers; cross-tenant tests (M2)
- [x] API keys and admin endpoints for issue/list/revoke (M3)
- [x] Persist and load tenant settings per environment (initial buckets, flags)
- [x] Add authorization scopes across admin APIs (API key scopes enforced)
- [x] Observability (structured logs, optional OTLP tracing, per-tenant metrics)
- [x] Redis pub/sub WS fan-out + distributed rate limits + metrics (M1)
- [x] E2E tests for Telegram flow and WS updates (smoke + limits)
- [x] CI/CD pipeline and deployment configuration (release workflow + smoke tests)
- [x] Outbox worker with retries and idempotency; admin enqueue (M5)
- [x] Templates/i18n APIs (M6) — admin upsert/list/delete, preview with fallback, public i18n
  - [x] CI: GitHub Actions workflow runs full smoke/E2E test suite on PRs/push
  - [x] M4 hardening: webhook metrics (ok/unauthorized/idempotent-skipped/parse-errors), stricter header secret, capped retry_after
  - [x] Ops hardening: env+secrets relocated to /etc/chatorical; systemd unit updated
 - [x] Billing scaffolding (M8 partial): Stripe config, catalog sync, checkout, webhook
 - [x] Plans in DB (EUR), features, CLI & Admin APIs (list/upsert/delete/sync)
 - [x] Usage metering (Redis daily counters, UsageEvent summarizer)
 - [x] Plan-based enforcement: starts/day, renames/day, tenant daily messages, active conversation cap; channel toggles
 - [x] Widget v2 enhancements: reconnect with token refresh, offline queue, presence UI, over‑limit feedback
 - [x] Widget v2 cache headers and versioning (`/widget.js?v=...`), A11y, unread badge, timestamps
 - [x] Outbox worker systemd unit + latency tuning via `OUTBOX_IDLE_MS`
 - [x] Telegram inbound mapping corrected to `OUTBOUND` for customer UI; WS publish with `createdAt`
 - [x] Redis pub/sub split connections to avoid subscriber publish errors
 - [x] Widget dedupe for inbound messages; backfill only on reconnect (since-cursor)

### In progress

- Tenant settings expansion (per-tenant feature flags) — ongoing
- Jobs: retention for closed conversations (worker added), audit exports (next)
- CI: add migrate + restart step template; branch protection docs
- Ops: finalize real bot token/group id and permissions on stage
 - Browser E2E (Puppeteer) — install Chrome headless deps on server

### Next steps (short-term)

- Idempotent enqueue for customer→Telegram using `conv_msg_out_<messageId>`.
- Admin outbox read‑only list endpoint (redacted payload by default).
- Manual multi‑tenant validation on staging with Tenant B (widget isolation + Telegram round‑trip).
- Worker unit hardening (non‑root, restart/backoff, graceful stop).
- Defer: Prometheus/queue metrics and headless browser E2E until later.

### Next up (backlog)

- Widget v2 polish (presence, reconnection, a11y, theming, i18n fetch)
- Presence tracking and stronger WS reconnection logic
- Billing: dunning/invoice events, dashboards, quotas across more routes

### Open questions / decisions to document

- Multi-tenancy boundary: header-based vs. subdomain vs. token claims
- Auth approach: service tokens vs. user auth (and RBAC granularity)
- Message storage format and retention policy
- Delivery guarantees for outbound channel sends (retry/backoff strategy)

### Changelog

- 2025-09-22: Initial creation of `PROGRESS.md` with current snapshot and milestones
- 2025-09-22: Implemented M1 (Redis hub, rate limits, metrics); added smoke tests
- 2025-09-22: Completed M2 (TenantContext + cross-tenant tests) and M3 (API keys + admin)
- 2025-09-22: Completed M5 (Outbox + worker + admin enqueue); starting M6 templates APIs
- 2025-09-22: Completed M6 templates/i18n (admin + preview + public); added E2E tests
- 2025-09-22: Enforced API key scopes across admin endpoints; standardized error envelopes
- 2025-09-22: Added per-tenant metrics, optional OTLP tracing, WS origin checks by tenant
- 2025-09-22: Telegram webhook per-tenant rate limit and disable flag; tests added
- 2025-09-22: Retention worker implemented with test; CI Release workflow with smoke tests
- 2025-09-22: Widget v2 bootstrap implemented (short‑lived WS token endpoint, minimal UI with send/history/i18n/status/reconnect)
- 2025-09-22: Public send endpoint added; tests and CI updated
- 2025-09-22: Stage site configured via Nginx with SSL; widget served at https://stage.chatorical.com
- 2025-09-22: CORS fixed for stage; WS upgrade via Nginx verified; widget connects
- 2025-09-22: KMS master key wired (file perms and env dedup); admin Telegram config save works
- 2025-09-22: Widget↔Telegram bridge added (thread-aware send); inbound direction fixed to INBOUND
- 2025-09-22: Auto-create Telegram forum topic per conversation on first send; fallback to configurable `telegram.defaultTopicId`
- 2025-09-22: Telegram webhook aligned (secret/header) and inbound verified on stage; added idempotency + per-tenant limiter
 - 2025-09-24: Widget script served with long-term cache headers and version param; release snippet added
 - 2025-09-24: Outbox worker service created; customer→Telegram delivery stabilized; latency tuned
 - 2025-09-24: Redis pub/sub separated (publisher/subscriber); live inbound duplicates fixed via client dedupe
 - 2025-09-24: Webhook persists messages as OUTBOUND (customer UI) and includes createdAt in WS payloads
 - 2025-09-24: Added `/v1/conversations/:id/messages?since=...` for reconnect backfill

### How to update this document

1. Edit `PROGRESS.md` when a milestone moves state or a new decision is made.
2. Keep entries concise; link to code (`src/...`) and PRs where helpful.
3. Update the "Last updated" date at the top.

### Quick links

- Prisma schema: `prisma/schema.prisma`
- Server entry: `src/index.ts`
- Tenant middleware: `src/middleware/tenantContext.ts`
- Conversations repo: `src/repositories/conversationRepo.ts`
- Telegram adapter: `src/channels/telegram/adapter.ts`
- Telegram webhook: `src/channels/telegram/webhook.ts`
- WebSocket server: `src/ws/server.ts`
- Seed script: `scripts/seedTelegram.js`

### Ops Commands Appendix

Service management (API + Worker):

```
sudo systemctl enable --now support-chat-v2 support-chat-v2-worker
sudo systemctl restart support-chat-v2 support-chat-v2-worker
systemctl status --no-pager support-chat-v2 support-chat-v2-worker | cat
journalctl -u support-chat-v2 -n 200 --no-pager | cat
journalctl -u support-chat-v2-worker -n 200 --no-pager | cat
```

Widget release snippet and cache-busted update:

```
WIDGET_ORIGIN=https://stage.chatorical.com npm run -s release:widget
sudo -n sed -i -E "s#/widget\.js\?v[^"]*#/widget.js?v=YYYYMMDDHHMM-sha#g" /var/www/stage/index.html
```

Tune outbox latency and restart worker:

```
echo 'OUTBOX_IDLE_MS=75' | sudo tee -a /etc/chatorical/support-chat-v2.env >/dev/null
sudo systemctl restart support-chat-v2-worker
```


