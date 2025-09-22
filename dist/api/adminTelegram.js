"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const crypto_1 = require("../services/crypto");
const adapter_1 = require("../channels/telegram/adapter");
const router = (0, express_1.Router)();
// POST /v1/admin/telegram/send { tenantSlug, chatId, text }
router.post('/v1/admin/telegram/send', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, chatId, text } = (req.body || {});
        if (!tenantSlug || !chatId || !text)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const ch = await prisma.channel.findFirst({ where: { tenantId: t.id, type: 'telegram' } });
        if (!ch)
            return res.status(404).json({ error: { code: 'telegram_channel_not_found' } });
        const cfg = (0, crypto_1.decryptJsonEnvelope)(ch.encConfig);
        await (0, adapter_1.sendTelegramText)(cfg.botToken, chatId, text);
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
// POST /v1/admin/telegram/config { tenantSlug, botToken, supportGroupId, webhookSecret, headerSecret? }
router.post('/v1/admin/telegram/config', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, botToken, supportGroupId, webhookSecret, headerSecret } = (req.body || {});
        if (!tenantSlug || !botToken || !supportGroupId || !webhookSecret)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        await (0, adapter_1.upsertTelegramChannel)(t.id, { botToken, supportGroupId: String(supportGroupId), headerSecret }, webhookSecret);
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
