# Support Chat v2 — Widget ↔ Telegram Topics (Multi‑Tenant) Architecture

This document specifies the proper, production‑grade design for the customer widget ↔ Telegram bridge in v2. It extends the v1 architecture (which works well single‑tenant) with explicit multi‑tenant boundaries, durability, and realtime delivery guarantees.

## Goals

- Multi‑tenant isolation for widget traffic, Telegram channels, and settings
- One Telegram forum topic per conversation (same as v1), created deterministically
- Bidirectional delivery:
  - Widget → Telegram topic (customer messages)
  - Telegram topic → Widget (agent replies)
- Durable history and robust realtime fan‑out (across restarts, reconnects)
- Observable: logs and metrics with tenant_id, conversation_id, chatId, threadId

## Non‑Goals

- Rich media and attachments (future)
- Per‑tenant rate plan policy details (covered separately)

## v1 Recap (What Worked)

- `ensureTopicForConversation(conversationId)` on conversation start or first send:
  - If `Conversation.threadId` exists → use it
  - Else create forum topic (`createForumTopic`) with name based on codename/customerName
  - Persist `threadId`; optionally send topic controls banner
- Customer sends post to Telegram with `message_thread_id=threadId`
- Telegram webhook resolves `threadId→conversation`, persists agent replies, and pushes to the widget

## v2 Model (Multi‑Tenant)

- `Tenant` — logical isolation unit
- `Channel` (type=telegram) per tenant holds:
  - `botToken`, `supportGroupId`, `webhookSecret`, optional `headerSecret`
  - Encrypted at rest (AES‑GCM) with server KMS master key
- `Setting` per tenant (string key/value):
  - `telegram.defaultTopicId` — fallback thread when topic creation is disabled or fails
  - `allowedOrigins`, per‑route limits (e.g., `rl.telegram_webhook.points/durationSec`)

## Topic Lifecycle (v2)

On conversation start (not first send):

```
ensureTopicForConversation(tenantId, conversationId):
  if Conversation.threadId present → return it
  load tenant Telegram channel (latest row)
  if channel missing or config incomplete → return undefined (root fallback only if explicitly desired)
  try createForumTopic(title = customerName ? `${customerName} — ${codename}` : codename)
    if ok → persist threadId, return threadId
  else
    if tenant Setting `telegram.defaultTopicId` is a number → persist threadId=default, return it
    else → log, return undefined
```

Notes:
- Persisting `threadId` at start ensures all subsequent sends target the same topic deterministically.
- v1 parity: same control flow; only difference is lookup by `tenantId`.

## Message Flow

### Widget → Telegram

1. Widget `POST /v1/conversations/:id/messages` with Bearer (conversation JWT)
2. API persists message as `INBOUND` (from customer)
3. Ensure topic id: `conversation.threadId` (should already be set at start); fallback to `telegram.defaultTopicId` only if needed
4. Send to Telegram:
   - `sendMessage(chat_id=supportGroupId, message_thread_id=threadId, text)`
5. Record usage/metrics

### Telegram → Widget

1. Telegram POSTs webhook `POST /v1/telegram/webhook/:secret` (per‑tenant channel row auth)
2. Verify headerSecret if configured; apply per‑tenant rate limits; idempotency on `update_id`
3. Parse update → `chat.type=supergroup`, get `message_thread_id` and text
4. Resolve `threadId → conversation` (create a new conversation with `threadId` if needed for topic‑first flows)
5. Persist as `OUTBOUND` (to customer)
6. Publish realtime event to WS hub: `{ direction: 'OUTBOUND', text, createdAt }`
7. Metrics/logging

Direction mapping (customer UI):

- Customer → `INBOUND`
- Agent/Telegram → `OUTBOUND`

## Admin Sends

- With `conversationId`: ensure topic for that conversation and send with `message_thread_id=threadId`
- Without `conversationId`: default to tenant `telegram.defaultTopicId` (send in that thread)

## Realtime Delivery & Robustness

- WS fan‑out hub keyed by `conversationId`
- Redis pub/sub for multi‑instance:
  - Use dedicated Redis connections for `publish` and `psubscribe` (subscriber connections cannot publish)
  - Channel pattern: `${redisKeyPrefix}ws:conv:<conversationId>`
- Widget connects:
  - Immediately fetch history (optionally `since` cursor based on last seen time) then stream WS
  - Backoff + token refresh already implemented; keep local offline queue for sends

## Security

- Webhook path secret per channel; optional `x-telegram-bot-api-secret-token` header
- Per‑tenant rate limits on webhook and public endpoints
- Idempotency on webhook `update_id` per tenant in Redis (short TTL)
- Cross‑tenant guards on all admin/public routes

## Observability

- Logs:
  - `telegram update received` (thread_id, text preview)
  - `tg_send_ok` / `tg_send_fail` (chatId, threadId, description)
  - Persist/publish spans: `telegram.persistMessage`, `redis_publish_failed`
- Metrics: sends/ok/fail, webhook latency, WS outbound, per‑tenant counts

## Migration from v1 → v2

1. Create channel rows for each tenant (bot token, support group, secrets)
2. Set `telegram.defaultTopicId` per tenant if desired
3. Backfill `threadId` for existing open conversations:
   - Use admin endpoint `POST /v1/admin/conversations/set-thread` or a one‑time script
4. Switch widget integration to v2 `/widget.js` and provide `tenantSlug`/`origin`
5. Validate end‑to‑end: start conversation → topic creation → bidirectional delivery

## Failure Modes & Fallbacks

- Topic creation fails → use `telegram.defaultTopicId`
- No default topic → log and skip topic thread (root post only if explicitly allowed)
- Webhook auth mismatch → 401; do not persist
- Redis publish failure → fallback to in‑process broadcast; log warning

## Test Plan (Stage)

1. Configure tenant channel and webhook; ensure bot admin rights in forum group
2. `telegram.defaultTopicId=4` set; start conversation → verify `threadId` persisted (4 or created)
3. Widget send lands in topic; Telegram reply appears live in widget; reload shows full history
4. Admin send with and without `conversationId`
5. Kill/restart service; widget reconnect; verify no message loss (history backfill)

## Operational Runbook

- Rotate bot tokens via admin config endpoint; reset webhook to the new secret
- Set/update tenant default topic via admin settings upsert
- Use `set-thread` admin endpoint to correct a mis‑threaded conversation
- Monitor `tg_send_fail` spikes; verify token/chatId/threadId

## Current Testing Status (2025‑09‑24)

- Tenants layer:
  - Admin settings list/upsert: OK (tested via `/v1/admin/settings/:tenantSlug` and `/v1/admin/settings/upsert`).
  - Channel config verify: OK (`/v1/admin/telegram/verify`).
  - Admin send: enqueued to Outbox with correct `message_thread_id` when available.
- Realtime + durability:
  - WS smoke and Redis fan‑out: OK (separate pub/sub connections).
  - Telegram inbound webhook → persist (OUTBOUND to customer) → WS publish with createdAt: OK.
  - Outbox worker (systemd unit) delivers queued sends with retry/backoff: OK.
  - Customer→Telegram latency tuned via OUTBOX_IDLE_MS (default 200ms; min 50ms).
- Widget:
  - Persistence (conversation/token, draft, unread, last seen): Implemented.
  - A11y, timestamps, agent labels, clear conversation: Implemented.
  - History backfill on reconnect (`since`/lastSeenMs): Implemented.
  - Live duplicate inbound fix: client-side dedupe + only backfill on reconnect.

## Next Phase

- Multi‑tenant staging validation:
  - Create at least two tenants with distinct Telegram channels and secrets.
  - Verify isolation: widget for tenant A cannot receive messages for tenant B and vice versa.
  - Per‑tenant CORS: set `allowedOrigins` and confirm enforcement.
- Widget release & snippet:
  - Use `npm run release:widget` to produce minified snippet with cache‑busted `?v=`.
  - Update stage index to reference `/widget.js?v=<timestamp+sha>`.
- Browser E2E (Puppeteer) for a tenant:
  - Load staging page with tenant widget.
  - Send message → see topic post.
  - Reply in topic → assert live render in widget without reload.
  - Note: install headless Chrome OS deps on server to run tests.
- Ops playbook dry‑run:
  - Rotate `webhookSecret` and headerSecret; re‑set Telegram webhook URL.
  - Simulate webhook rate‑limit and confirm 429 + metrics.
  - Add `support-chat-v2-worker` hardening (log dir ownership, restart limits).

## Near-term Implementation Notes (2025-09-24)

- Idempotent enqueue for customer→Telegram: use Outbox idempotency key `conv_msg_out_<messageId>` when enqueuing telegram sends to dedupe retries.
- Admin outbox list (read‑only): `GET /v1/admin/outbox?tenantSlug=&status=&limit=&includePayload=0|1` guarded by `admin:read`; payload text redacted unless `includePayload=1` with `admin:write`.
- Manual multi-tenant validation (Tenant B) on staging: distinct `allowedOrigins`, separate Telegram channel config, and widget isolation checks.


