"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const crypto_1 = require("../services/crypto");
const adapter_1 = require("../channels/telegram/adapter");
const topic_1 = require("../channels/telegram/topic");
const outbox_1 = require("../services/outbox");
const crypto_2 = require("crypto");
const router = (0, express_1.Router)();
// POST /v1/admin/telegram/send { tenantSlug, chatId, text, conversationId? }
router.post('/v1/admin/telegram/send', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, chatId, text, conversationId } = (req.body || {});
        if (!tenantSlug || !chatId || !text)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const ch = await prisma.channel.findFirst({ where: { tenantId: t.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
        if (!ch)
            return res.status(404).json({ error: { code: 'telegram_channel_not_found' } });
        const cfg = (0, crypto_1.decryptJsonEnvelope)(ch.encConfig);
        if (conversationId && typeof conversationId === 'string' && conversationId.trim().length > 0) {
            let threadId;
            try {
                threadId = await (0, topic_1.ensureTopicForConversation)(t.id, conversationId.trim());
            }
            catch { }
            if (typeof threadId === 'number' && Number.isFinite(threadId)) {
                await (0, adapter_1.enqueueTelegramTextInThread)(t.id, chatId, threadId, String(text || ''), (0, crypto_2.randomUUID)());
            }
            else {
                await (0, outbox_1.enqueueOutbox)(t.id, 'telegram_send', { chatId, text }, (0, crypto_2.randomUUID)());
            }
        }
        else {
            // Default to tenant-level defaultTopicId when no conversationId is provided
            let threadId;
            try {
                const rows = await (0, client_1.getPrisma)().setting.findMany({ where: { tenantId: t.id, key: 'telegram.defaultTopicId' } });
                const val = rows && rows[0] && rows[0].value ? Number(rows[0].value) : NaN;
                if (Number.isFinite(val))
                    threadId = val;
            }
            catch { }
            if (typeof threadId === 'number') {
                await (0, adapter_1.enqueueTelegramTextInThread)(t.id, chatId, threadId, String(text || ''), (0, crypto_2.randomUUID)());
            }
            else {
                await (0, outbox_1.enqueueOutbox)(t.id, 'telegram_send', { chatId, text }, (0, crypto_2.randomUUID)());
            }
        }
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
// POST /v1/admin/telegram/verify { tenantSlug }
router.post('/v1/admin/telegram/verify', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:read']), async (req, res) => {
    try {
        const { tenantSlug } = (req.body || {});
        if (!tenantSlug)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const ch = await prisma.channel.findFirst({ where: { tenantId: t.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
        if (!ch)
            return res.status(404).json({ error: { code: 'telegram_channel_not_found' } });
        const cfg = (0, crypto_1.decryptJsonEnvelope)(ch.encConfig);
        const ok = Boolean(cfg && cfg.botToken && cfg.botToken.length > 20);
        return res.json({ ok, hasSupportGroupId: Boolean(cfg.supportGroupId), hasHeaderSecret: Boolean(ch.headerSecret), webhookSecretSet: Boolean(ch.webhookSecret) });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// POST /v1/admin/conversations/set-thread { tenantSlug, conversationId, threadId }
router.post('/v1/admin/conversations/set-thread', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, conversationId, threadId } = (req.body || {});
        if (!tenantSlug || !conversationId || (threadId === undefined || threadId === null))
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const tid = Number(threadId);
        if (!Number.isFinite(tid) || tid <= 0)
            return res.status(400).json({ error: { code: 'bad_thread_id' } });
        const conv = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId: t.id } });
        if (!conv)
            return res.status(404).json({ error: { code: 'conversation_not_found' } });
        await prisma.conversation.update({ where: { id: conv.id }, data: { threadId: tid } });
        return res.json({ ok: true, conversationId: conv.id, threadId: tid });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
