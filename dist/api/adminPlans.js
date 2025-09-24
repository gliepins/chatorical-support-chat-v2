"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const billingRepo_1 = require("../repositories/billingRepo");
const billing_1 = require("../services/billing");
const router = (0, express_1.Router)();
// GET /v1/admin/plans
router.get('/v1/admin/plans', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:read']), async (_req, res) => {
    try {
        const plans = await (0, billingRepo_1.listPlansWithPricesAndFeatures)();
        return res.json({ plans });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// POST /v1/admin/plans/upsert { key, name, description?, prices[], features[] }
router.post('/v1/admin/plans/upsert', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const body = (req.body || {});
        if (!body.key || !body.name)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const p = await (0, billingRepo_1.upsertPlan)({ key: body.key, name: body.name, description: body.description }, Array.isArray(body.prices) ? body.prices : [], Array.isArray(body.features) ? body.features : []);
        return res.json({ ok: true, planId: p.id });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// DELETE /v1/admin/plans/:key
router.delete('/v1/admin/plans/:key', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        await (0, billingRepo_1.deactivatePlan)(req.params.key);
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// POST /v1/admin/plans/sync-stripe — DB → Stripe products/prices (EUR)
router.post('/v1/admin/plans/sync-stripe', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (_req, res) => {
    try {
        const plans = await (0, billingRepo_1.listPlansWithPricesAndFeatures)();
        const specs = [];
        for (const p of plans) {
            for (const pr of p.prices) {
                specs.push({
                    productKey: p.key,
                    productName: p.name,
                    priceKey: `${p.key}_${pr.interval}`,
                    unitAmountUsd: pr.unitAmountCents / 100,
                    interval: pr.interval,
                    currency: pr.currency,
                });
            }
        }
        const synced = await (0, billing_1.ensureStripeCatalog)(specs);
        return res.json({ ok: true, synced });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
