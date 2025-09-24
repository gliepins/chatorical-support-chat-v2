# Stripe Operations — Dev/Sandbox

This document explains how billing works in Support Chat v2 and how to operate it in dev/sandbox.

## Environment & Secrets

Set these in `/etc/chatorical/support-chat-v2.env` (or your env manager):

- `STRIPE_SECRET_KEY`: Restricted secret key (test) with minimum scopes
- `STRIPE_PUBLISHABLE_KEY`: Publishable key (test) — only needed if using client UI
- `STRIPE_WEBHOOK_SECRET`: Signing secret for the webhook endpoint

Server uses these from `src/config/env.ts`. Keys are not stored in code.

### Recommended Restricted Key Scopes

- Products: Read/Write (catalog sync)
- Prices: Read/Write (create/archive prices)
- Customers: Read/Write (one customer per tenant)
- Checkout Sessions: Write (create subscription checkouts)
- Subscriptions: Read (reflect status/plan)

## Webhook Setup

- Endpoint URL: `https://<your-api-domain>/v1/stripe/webhook`
  - Example: `https://stage.chatorical.com/v1/stripe/webhook`
- Events (suggested):
  - Required: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
  - Recommended: `invoice.payment_succeeded`, `invoice.payment_failed`, `checkout.session.expired`, `customer.subscription.trial_will_end`
  - Optional: `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.payment_action_required`
- The webhook route is mounted before JSON parsing to preserve the raw body for signature verification.

## Data Model (DB‑first Catalog in EUR)

Plans and features live in the database (EUR pricing by default):

- `Plan` — key, name, description, active flag
- `PlanPrice` — currency (default `eur`), `unitAmountCents`, interval (`month|year`), `stripePriceId`
- `PlanFeature` — arbitrary key/value pairs for limits/features

Stripe products/prices are derived from DB using a catalog sync task (see below). The app does not hardcode prices.

## CLI Operations

All commands run from the repo root.

1) Apply schema (dev):
```bash
npx prisma db push | cat
```

2) Seed default plans (Starter/Growth/Pro) with EUR prices and starter features:
```bash
npm run plans:seed
```

3) List current plans (prices, features):
```bash
npm run plans:list
```

4) Sync DB plans → Stripe products/prices, write back `stripePriceId`:
```bash
npm run plans:sync-stripe
```

5) Deactivate a plan (keeps history, disables prices):
```bash
npm run plans:deactivate pro
```

## Creating a Checkout for a Tenant

Use the admin API to generate a subscription Checkout URL. Requires `admin:write` scope or internal service token.

```bash
curl -sS -X POST https://<api-host>/v1/admin/billing/checkout \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_ADMIN_API_KEY' \
  -d '{
    "tenantSlug": "default",
    "priceId": "price_xxx",           // from plans:sync/list (EUR)
    "successUrl": "https://stage.chatorical.com/billing/success",
    "cancelUrl": "https://stage.chatorical.com/billing/cancel"
  }'
```

The system keeps one Stripe Customer per tenant and records:

- `Setting[stripe.customerId]` — customer id
- `Setting[stripe.subscriptionId]` — from `checkout.session.completed`
- `Setting[stripe.subscriptionStatus]` — from `customer.subscription.*`
- `Setting[stripe.planKey]` — price metadata key from subscription line item

## Enforcing Limits/Features

Plan limits are stored as `PlanFeature` key/value pairs, for example:

- `limits.active_conversations`: numeric or `unlimited`
- `limits.messages_per_day`: numeric or `unlimited`
- `channels.telegram|email|slack`: `true|false`

At enforcement points (rate limits, feature checks), read features for the tenant’s active plan and apply.

## Dev vs Prod

- This doc assumes Stripe Test mode and sandbox env.
- Use separate keys/secrets for staging vs production.
- Webhook endpoint should be public and protected with the Stripe signing secret.
- For local dev, forward events: `stripe listen --forward-to localhost:4012/v1/stripe/webhook`.

## Troubleshooting

- 400 at webhook with `missing_signature_or_secret`:
  - Ensure `STRIPE_WEBHOOK_SECRET` is set and the Dashboard endpoint matches the app URL.
- 400 `Webhook Error: ...`:
  - Signing secret mismatch or body altered by a proxy. Ensure raw body reaches the app.
- Catalog not updating:
  - Re‑run `npm run plans:sync-stripe`. Verify restricted key has Product/Price write permissions.
- Checkout errors:
  - Use an EUR price id (`price_...`) synced from the DB. Confirm the plan is active.

## Reference

- Source files:
  - `src/services/billing.ts` — Stripe client, catalog sync, customer/checkout helpers
  - `src/api/stripeWebhook.ts` — Webhook handler
  - `src/api/adminBilling.ts` — Admin endpoints (catalog sync, checkout)
  - `src/repositories/billingRepo.ts` — Plan/price/feature repo
- CLI scripts:
  - `src/scripts/plan_seed.ts`
  - `src/scripts/plan_list.ts`
  - `src/scripts/plan_sync_stripe.ts`
  - `src/scripts/plan_deactivate.ts`
