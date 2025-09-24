"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantPlanKey = getTenantPlanKey;
exports.getPlanFeatures = getPlanFeatures;
exports.featureBoolean = featureBoolean;
exports.featureNumberOrUnlimited = featureNumberOrUnlimited;
const client_1 = require("../db/client");
async function getTenantPlanKey(tenantId) {
    const prisma = (0, client_1.getPrisma)();
    try {
        const row = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: 'stripe.planKey' } } });
        if (row && typeof row.value === 'string' && row.value.trim().length > 0)
            return row.value;
    }
    catch { }
    return null;
}
async function getPlanFeatures(planKey) {
    const prisma = (0, client_1.getPrisma)();
    const p = await prisma.plan.findUnique({ where: { key: planKey }, include: { features: true } });
    const out = {};
    if (p && Array.isArray(p.features)) {
        for (const f of p.features) {
            out[f.key] = String(f.value ?? '');
        }
    }
    return out;
}
function featureBoolean(features, key, defaultValue = false) {
    const v = features[key];
    if (typeof v !== 'string')
        return defaultValue;
    const t = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(t))
        return true;
    if (['false', '0', 'no', 'off'].includes(t))
        return false;
    return defaultValue;
}
function featureNumberOrUnlimited(features, key) {
    const v = features[key];
    if (typeof v !== 'string' || v.trim() === '')
        return null;
    const t = v.trim().toLowerCase();
    if (t === 'unlimited')
        return 'unlimited';
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0)
        return n;
    return null;
}
