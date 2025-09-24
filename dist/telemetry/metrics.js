"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incWsConnections = incWsConnections;
exports.incWsOutbound = incWsOutbound;
exports.incWsOutboundForTenant = incWsOutboundForTenant;
exports.incRateLimitHit = incRateLimitHit;
exports.getMetricsText = getMetricsText;
exports.incTelegramSends = incTelegramSends;
exports.incTelegramErrors = incTelegramErrors;
exports.incTelegramWebhookOk = incTelegramWebhookOk;
exports.incTelegramWebhookUnauthorized = incTelegramWebhookUnauthorized;
exports.incTelegramWebhookIdempotentSkipped = incTelegramWebhookIdempotentSkipped;
exports.incTelegramWebhookParseErrors = incTelegramWebhookParseErrors;
exports.recordTelegramWebhookLatency = recordTelegramWebhookLatency;
exports.incRequestsForTenant = incRequestsForTenant;
exports.incRateLimitHitForTenant = incRateLimitHitForTenant;
exports.incWsConnectionsForTenant = incWsConnectionsForTenant;
exports.incOverLimitForTenant = incOverLimitForTenant;
let wsConnections = 0;
const wsConnectionsByTenant = new Map();
let wsOutboundMessagesTotal = 0;
const wsOutboundMessagesByTenant = new Map();
let rateLimitHitsTotal = 0;
const rateLimitHitsByBucket = new Map();
const rateLimitHitsByTenantBucket = new Map();
let telegramSendsTotal = 0;
let telegramErrorsTotal = 0;
let telegramWebhookOkTotal = 0;
let telegramWebhookUnauthorizedTotal = 0;
let telegramWebhookIdempotentSkippedTotal = 0;
let telegramWebhookParseErrorsTotal = 0;
let telegramWebhookLatencyMsTotal = 0;
let telegramWebhookRequestsTotal = 0;
let telegramWebhookLastMs = 0;
const requestsPerTenant = new Map();
let overLimitTotal = 0;
const overLimitByTenantBucket = new Map();
function incWsConnections(delta) {
    wsConnections += delta;
    if (wsConnections < 0)
        wsConnections = 0;
}
function incWsOutbound(count = 1) {
    wsOutboundMessagesTotal += count > 0 ? count : 0;
}
function incWsOutboundForTenant(tenantId, count = 1) {
    if (!tenantId)
        return;
    const prev = wsOutboundMessagesByTenant.get(tenantId) || 0;
    wsOutboundMessagesByTenant.set(tenantId, prev + (count > 0 ? count : 0));
}
function incRateLimitHit(bucketName) {
    rateLimitHitsTotal += 1;
    const prev = rateLimitHitsByBucket.get(bucketName) || 0;
    rateLimitHitsByBucket.set(bucketName, prev + 1);
}
function getMetricsText() {
    const lines = [];
    lines.push(`ws_connections ${wsConnections}`);
    for (const [tenant, count] of wsConnectionsByTenant.entries()) {
        lines.push(`ws_connections_tenant{tenant="${escapeLabel(tenant)}"} ${count}`);
    }
    lines.push(`ws_outbound_messages_total ${wsOutboundMessagesTotal}`);
    for (const [tenant, count] of wsOutboundMessagesByTenant.entries()) {
        lines.push(`ws_outbound_messages_tenant{tenant="${escapeLabel(tenant)}"} ${count}`);
    }
    lines.push(`rate_limit_hits_total ${rateLimitHitsTotal}`);
    lines.push(`telegram_sends_total ${telegramSendsTotal}`);
    lines.push(`telegram_errors_total ${telegramErrorsTotal}`);
    lines.push(`telegram_webhook_ok_total ${telegramWebhookOkTotal}`);
    lines.push(`telegram_webhook_unauthorized_total ${telegramWebhookUnauthorizedTotal}`);
    lines.push(`telegram_webhook_idempotent_skipped_total ${telegramWebhookIdempotentSkippedTotal}`);
    lines.push(`telegram_webhook_parse_errors_total ${telegramWebhookParseErrorsTotal}`);
    lines.push(`telegram_webhook_requests_total ${telegramWebhookRequestsTotal}`);
    lines.push(`telegram_webhook_latency_ms_total ${telegramWebhookLatencyMsTotal}`);
    lines.push(`telegram_webhook_last_ms ${telegramWebhookLastMs}`);
    lines.push(`over_limit_total ${overLimitTotal}`);
    for (const [bucket, count] of rateLimitHitsByBucket.entries()) {
        // Prometheus-style labels
        lines.push(`rate_limit_hits_bucket{bucket="${escapeLabel(bucket)}"} ${count}`);
    }
    for (const [key, count] of rateLimitHitsByTenantBucket.entries()) {
        const [tenant, bucket] = key.split('|');
        lines.push(`rate_limit_hits_bucket_tenant{tenant="${escapeLabel(tenant)}",bucket="${escapeLabel(bucket)}"} ${count}`);
    }
    for (const [key, count] of overLimitByTenantBucket.entries()) {
        const [tenant, bucket] = key.split('|');
        lines.push(`over_limit_tenant_bucket{tenant="${escapeLabel(tenant)}",bucket="${escapeLabel(bucket)}"} ${count}`);
    }
    for (const [tenant, count] of requestsPerTenant.entries()) {
        lines.push(`requests_per_tenant_total{tenant="${escapeLabel(tenant)}"} ${count}`);
    }
    return lines.join('\n') + '\n';
}
function escapeLabel(v) {
    return v.replace(/\"/g, '\\\"');
}
function incTelegramSends(delta = 1) { telegramSendsTotal += delta; }
function incTelegramErrors(delta = 1) { telegramErrorsTotal += delta; }
function incTelegramWebhookOk(delta = 1) { telegramWebhookOkTotal += delta; }
function incTelegramWebhookUnauthorized(delta = 1) { telegramWebhookUnauthorizedTotal += delta; }
function incTelegramWebhookIdempotentSkipped(delta = 1) { telegramWebhookIdempotentSkippedTotal += delta; }
function incTelegramWebhookParseErrors(delta = 1) { telegramWebhookParseErrorsTotal += delta; }
function recordTelegramWebhookLatency(ms) {
    if (Number.isFinite(ms) && ms >= 0) {
        telegramWebhookRequestsTotal += 1;
        telegramWebhookLatencyMsTotal += ms;
        telegramWebhookLastMs = ms;
    }
}
function incRequestsForTenant(tenantId, delta = 1) {
    const prev = requestsPerTenant.get(tenantId) || 0;
    requestsPerTenant.set(tenantId, prev + delta);
}
function incRateLimitHitForTenant(bucketName, tenantId) {
    const key = `${tenantId}|${bucketName}`;
    const prev = rateLimitHitsByTenantBucket.get(key) || 0;
    rateLimitHitsByTenantBucket.set(key, prev + 1);
}
function incWsConnectionsForTenant(tenantId, delta) {
    const prev = wsConnectionsByTenant.get(tenantId) || 0;
    let next = prev + delta;
    if (next < 0)
        next = 0;
    wsConnectionsByTenant.set(tenantId, next);
}
function incOverLimitForTenant(bucketName, tenantId) {
    overLimitTotal += 1;
    const key = `${tenantId}|${bucketName}`;
    const prev = overLimitByTenantBucket.get(key) || 0;
    overLimitByTenantBucket.set(key, prev + 1);
}
