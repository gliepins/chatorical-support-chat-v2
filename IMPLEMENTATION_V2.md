# Support Chat v2 — Implementation Strategy

This plan upgrades the current codebase in-place toward a multitenant, SaaS, modular platform while minimizing risk. Work is staged to keep production safe at every milestone.

## Milestone 0 — Prep

- Add `.env.example` with dev defaults and document secrets.
- Add `docker-compose.yml` for local Postgres/Redis.
- Introduce request ids, tenant id fields in logs.

Deliverables:
- docs: local run, ngrok/Cloudflare tunnel, Telegram webhook.

## Milestone 1 — Redis + WS Fan‑out + Rate Limiting

- Add Redis client.
- WS broadcast: publish on `tenant:<id>:conv:<id>`; subscribe and forward to local sockets.
- Replace in‑memory rate limits with Redis‑backed (IP, conversation, and API key).

Deliverables:
- env: `REDIS_URL`
- metrics: outbound ws messages, rate limit hits.

## Milestone 2 — Multitenant Schema & Repositories

- Add tables: Tenant, Member, ApiKey, Channel, Subscription, UsageEvent, Setting (scoped by tenant).
- Add `tenantId` to Conversation, Message, AuditLog, MessageTemplateLocale.
- Backfill existing data with a `default` tenant and foreign keys.
- Introduce `TenantContext` derived from subdomain/header/API key; pass through controllers.
- Refactor repositories to require tenant_id and enforce scoping.

Deliverables:
- Prisma migrations; seed default tenant.
- Middleware: `resolveTenantContext()`.

## Milestone 3 — API Keys & Namespacing

- Create API key issuance and hashing; scopes: `admin:read`, `admin:write`, `public:widget`, etc.
- Controllers accept either subdomain + session or `Authorization: Bearer <api-key>`.
- Optional namespacing `/t/:tenantId` for human clarity (kept backward‑compatible for default tenant).

Deliverables:
- Admin endpoints protected by keyed auth + roles.

## Milestone 4 — Channels as Adapters

- Extract Telegram into `channels/telegram` with the common `ChannelAdapter` interface.
- `Channel` table stores encrypted config per tenant (bot token, secrets).
- Webhook router resolves tenant by secret path or header and dispatches to adapter.

Deliverables:
- Encryption helper (envelope: KMS master → per‑tenant DEK); rotate on schedule.

## Milestone 5 — Domain Events & Outbox

- Emit events on ConversationStarted/MessageAdded/Claimed/Closed.
- Outbox table persists side‑effects (Telegram send, WS broadcast) and workers retry with jitter and idempotency keys.

Deliverables:
- Worker process (lightweight loop) + metrics; systemd unit `support-chat-v2-worker`.

## Milestone 6 — Templates & Translations per Tenant

- Scope message templates to tenant+locale; preserve legacy fallback.
- Add Translations provider (JSON catalogs) for widget/admin; fallback exact → 2‑letter → default.

Deliverables:
- Admin APIs to manage templates and translations; preview endpoint.

## Milestone 7 — Widget v2

- Bootstrap with tenant public id; fetch short‑lived WS token per connect.
- No bearer token persistence in cookies/localStorage; persist only conversation id if needed.
- Theming tokens and A11y polish; localized UI fetch.

Deliverables:
- Versioned widget script via `/widget.js?v=...` with cache headers; CSP guidance.

## Milestone 8 — Billing & Usage

- Stripe: products, prices, subscriptions; webhook handlers.
- UsageEvent metering for messages/active conversations; daily summaries.
- Limits enforcement with soft warnings → hard blocks per plan.

Deliverables:
- Admin usage dashboard per tenant.

## Milestone 9 — Observability & Ops

- Prometheus metrics for per‑tenant traffic, errors, rate‑limits, queue depth, Telegram sends.
- OpenTelemetry traces.
- Audit log exports and retention job.

## Rollout & Migration Steps

1) Deploy Redis; flip WS pub/sub under a feature flag.
2) Deploy schema migrations; backfill default tenant; read via repositories.
3) Enable TenantContext; move controllers gradually.
4) Switch Telegram to adapter; configure per‑tenant channels; rotate secrets.
5) Enable API keys; deprecate raw service token over time.
6) Release widget v2 with tenant bootstrap and versioned snippet generator (`scripts/releaseWidget.js`).
7) Turn on billing gates and usage reporting.

## Testing Strategy

- Unit tests: auth, token binding, repository scoping, template fallback.
- Integration: webhook handling (idempotency, header secret), WS auth/fan‑out, action execution.
- Cross‑tenant leak tests: attempt reads/writes across tenants → must fail.
- Load tests: WS broadcast and channel sends under burst.

## Acceptance Criteria (Phase by Phase)

- M1: Multiple instances broadcast WS messages correctly; Redis limiter blocks abuse.
- M2: All queries require tenant context; old endpoints work for default tenant.
- M3: API keys in place; logs include tenant_id; RBAC enforced.
- M4: Telegram isolated per tenant; inbound routed; retries work.
- M5: Outbox prevents message loss; retries succeed across restarts.
- M6: Templates & translations editable per tenant; fallbacks verified.
- M7: Widget connects with short‑lived tokens; no token persisted insecurely; client dedupe; reconnect backfill.
- M8: Billing webhooks recorded; over‑limit behavior correct.
- M9: Dashboards show per‑tenant metrics; audits exportable.

---
Last updated: 2025-09-24


## Immediate Next Steps (2025-09-24)

- Idempotent customer→Telegram enqueue:
  - Use idempotency key `conv_msg_out_<messageId>` when enqueuing to Outbox to prevent duplicate sends across retries/restarts.
- Admin outbox (read‑only) list endpoint:
  - `GET /v1/admin/outbox?tenantSlug=&status=&limit=&includePayload=0|1`
  - Requires `admin:read` (and tenant match). Payload text redacted by default; `includePayload=1` requires `admin:write`.
- Multi‑tenant validation (Tenant B) — manual on staging:
  - Create tenant B; configure Telegram channel (bot token, group id, webhook/header secrets).
  - Set `allowedOrigins` for tenant B; embed widget with `tenantSlug` + origin.
  - Verify isolation: widget A ≠ widget B; Telegram round‑trip per tenant only.
- Worker unit hardening (ops):
  - Non‑root user, env file in `/etc/chatorical`, `Restart=on-failure`, graceful stop.
- Deferred (later phase):
  - Prometheus/queue metrics, browser E2E with headless browsers, extended widget polish.

## Appendix — Ops Commands

Widget release/versioning:

```
WIDGET_ORIGIN=https://stage.chatorical.com npm run -s release:widget
sudo -n sed -i -E "s#/widget\.js\?v[^"]*#/widget.js?v=YYYYMMDDHHMM-sha#g" /var/www/stage/index.html
```

Services (API + Worker):

```
sudo systemctl enable --now support-chat-v2 support-chat-v2-worker
sudo systemctl restart support-chat-v2 support-chat-v2-worker
systemctl status --no-pager support-chat-v2 support-chat-v2-worker | cat
journalctl -u support-chat-v2 -n 100 --no-pager | cat
journalctl -u support-chat-v2-worker -n 100 --no-pager | cat
```

Latency tuning for outbox:

```
echo 'OUTBOX_IDLE_MS=75' | sudo tee -a /etc/chatorical/support-chat-v2.env >/dev/null
sudo systemctl restart support-chat-v2-worker
```


