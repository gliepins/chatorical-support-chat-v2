let wsConnections = 0;
let wsOutboundMessagesTotal = 0;
let rateLimitHitsTotal = 0;
const rateLimitHitsByBucket = new Map<string, number>();
const rateLimitHitsByTenantBucket = new Map<string, number>();
let telegramSendsTotal = 0;
let telegramErrorsTotal = 0;
let telegramWebhookOkTotal = 0;
let telegramWebhookUnauthorizedTotal = 0;
let telegramWebhookIdempotentSkippedTotal = 0;
let telegramWebhookParseErrorsTotal = 0;
const requestsPerTenant = new Map<string, number>();

export function incWsConnections(delta: number) {
  wsConnections += delta;
  if (wsConnections < 0) wsConnections = 0;
}

export function incWsOutbound(count = 1) {
  wsOutboundMessagesTotal += count > 0 ? count : 0;
}

export function incRateLimitHit(bucketName: string) {
  rateLimitHitsTotal += 1;
  const prev = rateLimitHitsByBucket.get(bucketName) || 0;
  rateLimitHitsByBucket.set(bucketName, prev + 1);
}

export function getMetricsText(): string {
  const lines: string[] = [];
  lines.push(`ws_connections ${wsConnections}`);
  lines.push(`ws_outbound_messages_total ${wsOutboundMessagesTotal}`);
  lines.push(`rate_limit_hits_total ${rateLimitHitsTotal}`);
  lines.push(`telegram_sends_total ${telegramSendsTotal}`);
  lines.push(`telegram_errors_total ${telegramErrorsTotal}`);
  lines.push(`telegram_webhook_ok_total ${telegramWebhookOkTotal}`);
  lines.push(`telegram_webhook_unauthorized_total ${telegramWebhookUnauthorizedTotal}`);
  lines.push(`telegram_webhook_idempotent_skipped_total ${telegramWebhookIdempotentSkippedTotal}`);
  lines.push(`telegram_webhook_parse_errors_total ${telegramWebhookParseErrorsTotal}`);
  for (const [bucket, count] of rateLimitHitsByBucket.entries()) {
    // Prometheus-style labels
    lines.push(`rate_limit_hits_bucket{bucket="${escapeLabel(bucket)}"} ${count}`);
  }
  for (const [key, count] of rateLimitHitsByTenantBucket.entries()) {
    const [tenant, bucket] = key.split('|');
    lines.push(`rate_limit_hits_bucket_tenant{tenant="${escapeLabel(tenant)}",bucket="${escapeLabel(bucket)}"} ${count}`);
  }
  for (const [tenant, count] of requestsPerTenant.entries()) {
    lines.push(`requests_per_tenant_total{tenant="${escapeLabel(tenant)}"} ${count}`);
  }
  return lines.join('\n') + '\n';
}

function escapeLabel(v: string): string {
  return v.replace(/\"/g, '\\\"');
}

export function incTelegramSends(delta = 1) { telegramSendsTotal += delta; }
export function incTelegramErrors(delta = 1) { telegramErrorsTotal += delta; }
export function incTelegramWebhookOk(delta = 1) { telegramWebhookOkTotal += delta; }
export function incTelegramWebhookUnauthorized(delta = 1) { telegramWebhookUnauthorizedTotal += delta; }
export function incTelegramWebhookIdempotentSkipped(delta = 1) { telegramWebhookIdempotentSkippedTotal += delta; }
export function incTelegramWebhookParseErrors(delta = 1) { telegramWebhookParseErrorsTotal += delta; }

export function incRequestsForTenant(tenantId: string, delta = 1) {
  const prev = requestsPerTenant.get(tenantId) || 0;
  requestsPerTenant.set(tenantId, prev + delta);
}

export function incRateLimitHitForTenant(bucketName: string, tenantId: string) {
  const key = `${tenantId}|${bucketName}`;
  const prev = rateLimitHitsByTenantBucket.get(key) || 0;
  rateLimitHitsByTenantBucket.set(key, prev + 1);
}


