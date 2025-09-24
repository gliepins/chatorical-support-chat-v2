"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const billing_1 = require("../services/billing");
const router = (0, express_1.Router)();
// POST /v1/admin/billing/sync-catalog { plans: PlanSpec[] }
router.post('/v1/admin/billing/sync-catalog', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const body = (req.body || {});
        const plans = Array.isArray(body.plans) ? body.plans : [];
        if (plans.length === 0)
            return res.status(400).json({ error: { code: 'missing_plans' } });
        const synced = await (0, billing_1.ensureStripeCatalog)(plans);
        return res.json({ ok: true, synced });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// POST /v1/admin/billing/checkout { tenantSlug, priceKey, successUrl, cancelUrl }
router.post('/v1/admin/billing/checkout', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, priceId, successUrl, cancelUrl } = (req.body || {});
        if (!tenantSlug || !priceId || !successUrl || !cancelUrl)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const url = await (0, billing_1.createCheckoutSessionForTenant)({ tenantId: t.id, tenantSlug: t.slug, priceId, successUrl, cancelUrl });
        return res.json({ url });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
