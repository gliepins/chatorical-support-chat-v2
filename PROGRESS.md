## Support Chat v2 — Project Progress

Last updated: 2025-09-22

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
- **Scripts**
  - `scripts/seedTelegram.js` — seed helper for Telegram

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
- [ ] Persist and load tenant settings per environment
- [ ] Add authentication/authorization flows (roles/scopes across admin APIs)
- [ ] Observability (structured logs, tracing, metrics)
- [x] Redis pub/sub WS fan-out + distributed rate limits + metrics (M1)
- [ ] E2E tests for Telegram flow and WS updates
- [ ] CI/CD pipeline and deployment configuration
- [x] Outbox worker with retries and idempotency; admin enqueue (M5)
- [x] Templates/i18n APIs (M6) — admin upsert/list/delete, preview with fallback, public i18n
 - [x] CI: GitHub Actions workflow runs full smoke/E2E test suite on PRs/push
 - [x] M4 hardening: webhook metrics (ok/unauthorized/idempotent-skipped/parse-errors), stricter header secret, capped retry_after

### In progress

- Documentation: establishing this progress log and usage notes
- Webhook resilience: Telegram retry/backoff + idempotency metrics (M4)
- Templates/i18n APIs (M6) — starting with admin endpoints
  - Admin endpoints done; preview + public i18n done
- CI/ops: stabilize Redis hub reconnections and logging enrichment (done)
- Tenant settings service and admin endpoints

### Next up (backlog)

- Implement tenant-level configuration persistence and retrieval API
- Add standardized error handling and response envelopes
- Introduce request tracing and correlation IDs
- Harden WebSocket reconnection and presence tracking
- Add integration tests covering Telegram inbound → conversation → WS broadcast
  - [done] E2E inbound + WS broadcast smoke tests
- Domain events + outbox worker with retries and idempotency (M5)
  - [done] basic outbox and worker, admin enqueue

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


