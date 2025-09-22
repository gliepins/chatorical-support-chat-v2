# Support Chat v2 — SaaS, Multitenant, Modular Whitepaper

## 1. Executive Summary

Support Chat v2 evolves the current single-tenant, Telegram-first product into a SaaS, multitenant, channel‑pluggable platform. It preserves the winning traits (tiny widget, Telegram for agents, API‑first) while adding tenant isolation, billing, observability, and a clean plugin model for channels, actions, messages, and translations. The system is designed to scale horizontally via Redis pub/sub, distributed rate limiting, and an event outbox, and to be extended without core code changes through registries and contracts.

## 2. Product Vision

- Customer support infrastructure that “just works” in minutes via a small web widget.
- Agents keep using native apps (Telegram first), with other channels (Slack/Email/WhatsApp) available as add‑ons.
- Operated as a secure SaaS: each tenant has isolated data, secrets, rate limits, and branding.
- Pay‑as‑you‑grow pricing based on active conversations, messages, or seats.

## 3. Architecture Overview

- API service (Node/TS) exposes HTTP, WS, and channel webhooks. No direct DB access outside repositories. Request validation via zod or OpenAPI.
- Redis: pub/sub for cross‑instance WS fan‑out and distributed rate limiting.
- Postgres via Prisma repositories; event outbox tables for reliable side‑effects.
- Channel adapters implement a common interface. Telegram is the default adapter.
- Domain events (ConversationStarted, MessageAdded, ConversationClaimed, ConversationClosed) drive side effects (WS echo, Telegram posts, reminders, metrics).
- Widget is a small JS bundle with theming + i18n; uses short‑lived tokens.

## 4. Multitenancy Model

- Tenant: owns data, branding, settings, channels, and billing subscription.
- Member: tenant users (agents/admins) with roles.
- ApiKey: server‑to‑server auth per tenant with scopes and TTL/rotation.
- Channel: configuration for a messaging channel (e.g., Telegram bot token, webhook secret), encrypted at rest.
- Subscription: plan, status, limits/quotas.
- UsageEvent: metering (messages, active conversations, seats).

All core entities (Conversation, Message, AuditLog, MessageTemplateLocale, Settings) are scoped by tenant_id. Queries are enforced via TenantContext and repository guards.

## 5. Data Model Additions (high level)

- Tenant(id, name, slug, createdAt, updatedAt)
- Member(id, tenantId, userId/email, role, isActive, createdAt, updatedAt)
- ApiKey(id, tenantId, name, hashedKey, scopes[], createdAt, lastUsedAt)
- Channel(id, tenantId, type, config(json, encrypted), status, createdAt, updatedAt)
- Subscription(id, tenantId, provider, plan, status, currentPeriodEnd, seats, limits(json))
- UsageEvent(id, tenantId, type, subjectId, count, occurredAt)
- Conversation(+tenantId, ...)
- Message(+tenantId, ...)
- AuditLog(+tenantId, ...)
- MessageTemplateLocale(+tenantId, key, locale, ...)
- Setting(+tenantId, key, value)

## 6. Security & Secrets

- Per‑tenant signing keys: conversation JWTs signed by a platform secret; include tenant_id and conversation_id; short TTLs. Optionally use per‑tenant salt.
- API authentication: `Authorization: Bearer <api-key>` with hash lookup, scopes, and rate limits; optional mTLS for enterprise.
- Secrets at rest: channel configs (e.g., Telegram BOT_TOKEN) encrypted with envelope encryption (platform KMS master key → per‑tenant DEK).
- Strict input validation, bounded payloads, and consistent audit logs. All outbound token leaks are prevented by short‑lived, refreshable WS tokens and avoiding cookie storage.

## 7. Performance & Scale

- Redis pub/sub for WS fan‑out across instances (topic: `tenant:<id>:conv:<id>`). Local instance keeps only connected sockets.
- Distributed rate limiting per tenant, IP, API key, and conversation, enforced with Redis.
- Event outbox pattern for Telegram/webhook sends with retry/backoff and idempotency keys (e.g., Telegram update_id).
- Read/write DB indexes: (tenantId, updatedAt), (tenantId, status), (tenantId, threadId), (tenantId, locale, key).

## 8. Channels (Pluggable)

Common interface for all channels:

- ensureThread(conversation)
- sendAgentText(conversationId, text)
- sendCustomerText(conversationId, text)
- sendButtons(conversationId, buttons?)
- handleInbound(update): normalize to domain events

Telegram specifics in adapter: create/edit/close forum topic, inline buttons (Claim/Close), slash commands with normalization, retries honoring `retry_after`.

## 9. Actions & Templates

- Actions: registry of verbs (claim, close, note, codename, reopen); validate payload with schemas. Surfaces: agent/customer. Channel adapters render actions into native UI (e.g., Telegram inline keyboard, widget buttons).
- System message templates: per‑tenant, per‑locale, with flags (persist, toWS, toChannels[], pinInTopic) and per‑conversation rate‑limit. Rendering supports {customer_name}, {agent_name}, {codename}.

## 10. Widget v2

- Uses tenant public id (or slug) to obtain a short‑lived WS token; avoids storing bearer in localStorage/cookies when possible. If persistence is required, store only conversation id; fetch fresh token on connect.
- Theming via CSS variables and design tokens; i18n catalogs fetched per tenant/locale.
- Extensible client actions (e.g., reopen, start new) via config.

## 11. Observability & Compliance

- Metrics (Prometheus): WS connections/messages, rate‑limit hits, Telegram sends/failures with `retry_after`, webhook latency, DB query latency, per‑tenant request counts.
- Tracing (OpenTelemetry): correlate API → domain → channel send.
- Logging: structured (pino) with tenant_id, conversation_id, request_id.
- Compliance: data retention per tenant (e.g., purge closed conversations after N days). Right‑to‑erasure endpoints.

## 12. Billing & Plans

- Stripe products (Starter, Growth, Pro); seats optional.
- Metering via UsageEvent: count messages, active conversations, and optionally MAUs; usage summarized daily.
- Limits enforced in‑path (soft warnings → hard block). Grace periods for delinquency.

## 13. Backward Compatibility & Migration

- Create a default tenant; backfill existing rows with tenant_id=default.
- Gradually enforce TenantContext in repositories; controllers unchanged initially.
- Telegram: migrate to per‑tenant channels; allow a “global” channel only for default tenant in early rollout.
- Feature flags to switch WS pub/sub and Redis rate limiting per environment.

## 14. Roadmap (High‑Level)

1) Infra: Redis in place; WS pub/sub; distributed rate limiting.
2) Schema: multitenant tables; backfill; repository scoping; TenantContext.
3) Auth: API keys with scopes; conversation JWT contains tenant_id; WS auth updated.
4) Channels: extract Telegram adapter; channel registry; per‑tenant secrets encrypted.
5) Templates & i18n: scope by tenant; admin APIs to manage per locale.
6) Widget v2: tenant bootstrap + short‑lived tokens; UX polish and accessibility.
7) Billing: Stripe integration, metering, limits.
8) Observability: metrics, traces, audits per tenant.
9) Documentation & SDKs: OpenAPI, client libraries, onboarding flows.

## 15. Risks & Mitigations

- Webhook delivery spikes → outbox + retry with jitter; rate limit and backpressure.
- Tenant leakage via bugs → repository scoping and integration tests that try cross‑tenant reads/writes; static checks for controllers requiring TenantContext.
- Telegram API changes → adapter contract, typed client layer, and alerting on schema drift.
- Cost overruns → Redis and DB quotas; efficient indexes; message size caps.

---
Last updated: 2025-09-22



