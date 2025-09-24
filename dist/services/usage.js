"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrDailyCounter = incrDailyCounter;
exports.getDailyCounter = getDailyCounter;
exports.incrDailyMessages = incrDailyMessages;
exports.getDailyMessages = getDailyMessages;
const kv_1 = require("../redis/kv");
const env_1 = require("../config/env");
const redis = (0, kv_1.getRedis)();
function key(tenantId, conversationId, counter, dateStr) {
    const conv = conversationId ? `conv:${conversationId}` : 'tenant';
    return `${env_1.CONFIG.redisKeyPrefix}usage:${tenantId}:${conv}:${counter}:${dateStr}`;
}
function today() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
async function incrDailyCounter(tenantId, counter, conversationId = null) {
    const k = key(tenantId, conversationId, counter, today());
    const v = await redis.incr(k);
    if (v === 1) {
        // expire after ~2 days to cover timezone skew
        await redis.expire(k, 172800);
    }
    return v;
}
async function getDailyCounter(tenantId, counter, conversationId = null) {
    const k = key(tenantId, conversationId, counter, today());
    const v = await redis.get(k);
    return v ? Number(v) : 0;
}
// Backward-compatible helpers for messages
async function incrDailyMessages(tenantId, conversationId) {
    return incrDailyCounter(tenantId, 'messages', conversationId);
}
async function getDailyMessages(tenantId, conversationId) {
    return getDailyCounter(tenantId, 'messages', conversationId);
}
