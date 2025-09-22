# Tenant Settings

Settings are key/value pairs stored per tenant in the `Setting` table. Values are strings; some keys expect comma-separated lists.

## Keys

- allowedOrigins: comma-separated list of origins allowed for CORS for this tenant (e.g., https://app.example.com, https://widget.example.com).
- rl.start.points: number of allowed `/v1/conversations/start` requests per window per IP.
- rl.start.durationSec: window size in seconds for `/v1/conversations/start` rate limit.

## Behavior

- CORS: allowedOrigins are merged with global ALLOWED_ORIGINS env and enforced per request using the tenant derived by tenantContext.
- Rate limits: if settings exist for rl.start.*, they override defaults; otherwise env defaults apply.

## Admin API

- Upsert: POST /v1/admin/settings/upsert { tenantSlug, key, value }
- List: GET /v1/admin/settings/:tenantSlug
