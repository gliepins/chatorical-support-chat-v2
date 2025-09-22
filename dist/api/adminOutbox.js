"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const outbox_1 = require("../services/outbox");
const router = (0, express_1.Router)();
// POST /v1/admin/outbox/telegram { tenantSlug, chatId, text, idempotencyKey? }
router.post('/v1/admin/outbox/telegram', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, chatId, text, idempotencyKey } = (req.body || {});
        if (!tenantSlug || !chatId || !text)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const item = await (0, outbox_1.enqueueOutbox)(t.id, 'telegram_send', { chatId, text }, idempotencyKey);
        return res.json({ id: item.id, status: 'enqueued' });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
