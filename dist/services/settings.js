"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSetting = getSetting;
exports.invalidateSetting = invalidateSetting;
exports.getCommaListSetting = getCommaListSetting;
exports.getBooleanSetting = getBooleanSetting;
const client_1 = require("../db/client");
const cache = new Map();
const DEFAULT_TTL_MS = 30000;
function keyOf(tenantId, key) {
    return `${tenantId}::${key}`;
}
async function getSetting(tenantId, key, ttlMs = DEFAULT_TTL_MS) {
    const ck = keyOf(tenantId, key);
    const now = Date.now();
    const hit = cache.get(ck);
    if (hit && hit.expiresAt > now)
        return hit.value === null ? undefined : hit.value;
    try {
        const prisma = (0, client_1.getPrisma)();
        const row = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key } } });
        const val = row ? row.value : null;
        cache.set(ck, { value: val, expiresAt: now + ttlMs });
        return val === null ? undefined : val;
    }
    catch {
        return undefined;
    }
}
function invalidateSetting(tenantId, key) {
    cache.delete(keyOf(tenantId, key));
}
async function getCommaListSetting(tenantId, key) {
    const v = await getSetting(tenantId, key);
    if (!v)
        return [];
    return v.split(',').map(s => s.trim()).filter(Boolean);
}
async function getBooleanSetting(tenantId, key, defaultValue = false) {
    const v = await getSetting(tenantId, key);
    if (typeof v !== 'string')
        return defaultValue;
    const norm = v.trim().toLowerCase();
    if (norm === 'true' || norm === '1' || norm === 'yes' || norm === 'on')
        return true;
    if (norm === 'false' || norm === '0' || norm === 'no' || norm === 'off')
        return false;
    return defaultValue;
}
