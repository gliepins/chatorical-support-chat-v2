# Support Chat v2 — Handoff Brief

This brief captures the v2 requirements you provided for the next developer. It complements `documents/IMPLEMENTATION_V2.md` and `documents/WHITEPAPER_V2.md`.

## Must‑keep compatibility

**Keep v1 endpoints working for default tenant.**

Widget v1 must work unchanged: same WS path, same event shapes:

- `agent_joined`: `{ type: 'agent_joined', agent?: string }`
- `info_note`: `{ type: 'info_note', key?: string, text: string }`
- `conversation_closed`: `{ type: 'conversation_closed' }`
- messages echo: `{ direction: 'INBOUND'|'OUTBOUND', text: string, agent?: string }`

Telegram behavior parity: claim‑before‑reply, silent notifications by default, topic title updates on rename/note.

## Critical focus areas

- **TenantContext everywhere**: No DB access without `tenant_id`; enforce in repositories and queries.
- **Redis from day 1**: WS pub/sub fan‑out and distributed rate limits (per tenant, IP, API key, conversation).
- **Secrets handling**: Per‑tenant encrypted channel configs; no fallback to `SERVICE_TOKEN` for JWT; short‑lived conversation JWTs.
- **Webhook robustness**: Verify header secret; idempotency on updates; `retry_after` backoff for Telegram.
- **Event‑driven architecture**: Emit domain events (Started, Added, Claimed, Closed); use outbox + worker for retries.
- **Observability**: Per‑tenant metrics/logs; `request_id`; OpenTelemetry traces; alerts on Telegram/API failures.
- **Indexing**: Add `(tenantId, updatedAt)`, `(tenantId, status)`, `(tenantId, threadId)`, `(tenantId, locale, key)` indexes.

## Things easy to miss

- Migration safety: Backfill default tenant, keep legacy template fallback (MessageTemplate → default) until v2 templates are live.
- Widget tokens: Don’t store bearer in localStorage/cookies; fetch short‑lived token per connect; persist only conversation id if needed.
- Rate‑limit granularity: Separate limits for `/start`, rename, WS messages, API keys; exponential backoff on abuse.
- Telegram edge cases: Group/forum permissions, threadId uniqueness, bot admin rights, username missing, long messages splitting.
- Error tolerance: Webhook JSON parse failures must return `{ ok: true }` to avoid Telegram retries (as v1 does).
- Locale fallback: exact → 2‑letter → default for both templates and UI strings.
- Admin flows: Export endpoints and bulk delete must also clean up topics best‑effort (keep parity).
- Security headers/CORS: Per‑tenant allowlist; WS origin checks.

## Definition of done per milestone (quick)

- M1: Redis pub/sub broadcasting works across two instances; Redis rate limiting enforced; metrics exposed.
- M2: All read/write paths require TenantContext; cross‑tenant access impossible (tests).
- M3: API keys with scopes; logs include tenant_id; default tenant remains backward compatible.
- M4: Telegram adapter isolated per tenant; inbound routed by secret; retries/backoff implemented.
- M5: Outbox persists side‑effects; worker retries survive restarts; idempotency keys honored.
- M6: Templates and translations scoped to tenant; preview API; fallback works.
- M7: Widget v2 uses tenant bootstrap + short‑lived WS tokens; v1 widget still works.
- M8: Billing webhooks recorded; limits enforced with soft/hard thresholds.
- M9: Per‑tenant dashboards/metrics; audit exports; retention job.

## Environment and ops

Required env vars: `DATABASE_URL`, `REDIS_URL`, `CONVERSATION_JWT_SECRET`, `SERVICE_TOKEN` (for legacy admin), `PORT`.
Environment separation: dev vs prod with distinct DBs (`support_chat_dev`, `support_chat_prod`), logging modes (pretty vs JSON), and non‑mocked operation (avoid seeds).

Telegram per tenant: `BOT_TOKEN`, `WEBHOOK_SECRET`, optional `TELEGRAM_HEADER_SECRET`, `SUPPORT_GROUP_ID`.

Health checks: `/health` (basic), `/ready` (strict), deep health endpoint parity (start→topic→welcome→token).

CI/CD: run Prisma migrations, build widget, restart app; feature flags for Redis pub/sub and TenantContext enforcement.

## Testing checklist

- Cross‑tenant leak tests (must 403/404).
- Webhook idempotency (same update twice → once).
- WS auth with stale/forged tokens (must fail).
- Rate‑limits hit under load; logs/metrics reflect.
- Topic lifecycle: create/edit/pin/close flows work.
- Template/i18n fallback for unknown locale.

If helpful, provide a starter “contracts” package (TypeScript interfaces) and skeletons for TenantContext middleware, Redis hub, repositories, and a Telegram adapter to accelerate day one.

## Operational checklist with sensible defaults

v1 deployment
- Public widget origin(s)? Use unchanged paths/events for default tenant.
- Any Nginx/CSP/header quirks we must preserve?

Data/migration
- Migrate v1 conversations/templates into default tenant, or start fresh?
- If unknown: migrate templates, start fresh conversations.
- Approx DB size and daily growth? Default: add indexes now; paginate admin lists.

Telegram
- Bot admin in Supergroup with Topics? Silent notifications desired? Use claim-before-reply?
- Are pinning and long messages used? If unknown: keep silent, split >4096 chars, keep pinning.

Rate limiting
- Desired limits for /start, rename, WS msg/sec?
- If unknown: /start 10/min/IP; rename 3/day/conv; WS 30/10s per socket.

Observability
- Where do logs go? Any Prometheus/alerts?
- If unknown: enable pino + Prom metrics; alert on webhook 4xx/5xx spikes, WS disconnect spikes.

Security/retention
- Retention days for closed conversations? If unknown: 90 days; daily purge job.
- Any erasure/export cadence? If unknown: export on request; erase within 30 days.

CORS/proxy
- Exact allowed origins (widget/admin). If unknown: whitelist current widget domain(s) only.
- Per-tenant subdomains planned? If yes, confirm pattern.

Admin/API keys
- Who uses admin today? Need API keys + roles now, or phase in?
- If unknown: keep SERVICE_TOKEN initially, add API keys in M3.

Backward compatibility
- Must v1 admin stay, or only public widget/APIs?
- If unknown: keep both for default tenant.

Priorities
- Pick top milestone first (recommend M1 Redis fan-out + distributed limits).

Infra (restate)
- Postgres: separate DB/role recommended; else dedicated schema.
- Redis: DB 3 + key prefix scv2.
- Node 20; port 4012; Nginx in front keeping /widget.js and /v1/ws paths.
- SaaS public domain: `chatorical.com`.
- Provide BOT_TOKEN, SUPPORT_GROUP_ID, WEBHOOK_SECRET, TELEGRAM_HEADER_SECRET; CONVERSATION_JWT_SECRET, SERVICE_TOKEN.

Extras to not miss
- Keep v1 webhook’s “ok on JSON parse error” behavior to avoid Telegram retries.
- Never store bearer tokens in localStorage/cookies; short-lived WS tokens only.
- Add indexes early: (tenantId, updatedAt), (tenantId, status), (tenantId, threadId), (tenantId, locale, key).
- Accessibility/browser support targets for widget (confirm: evergreen + iOS 14+/Android 8+).
- Backup/restore expectations (daily DB backups verified).


