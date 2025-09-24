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
// GET /v1/admin/outbox (read-only list)
// Query: tenantSlug (required), status?, limit? (default 50), includePayload? (0/1)
router.get('/v1/admin/outbox', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:read', 'admin:write']), async (req, res) => {
    try {
        const tenantSlug = String(req.query?.tenantSlug || '');
        if (!tenantSlug)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const includePayloadRaw = String(req.query?.includePayload || '0');
        const includePayload = includePayloadRaw === '1' || includePayloadRaw.toLowerCase() === 'true';
        const status = String(req.query?.status || '');
        const limitNum = Math.max(1, Math.min(200, Number(req.query?.limit || 50)));
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const where = { tenantId: t.id };
        if (status)
            where.status = status;
        const rows = await prisma.outbox.findMany({ where, orderBy: { createdAt: 'desc' }, take: limitNum });
        const canSeePayload = includePayload && !!(apiKey && Array.isArray(apiKey.scopes) && apiKey.scopes.includes('admin:write'));
        const redacted = rows.map((r) => {
            const payload = r.payload || {};
            const meta = {
                chatId: payload.chatId,
                message_thread_id: payload.message_thread_id,
                text: canSeePayload ? payload.text : undefined,
                text_redacted: canSeePayload ? false : (typeof payload.text === 'string'),
            };
            return {
                id: r.id,
                status: r.status,
                attempts: r.attempts,
                nextAttemptAt: r.nextAttemptAt,
                createdAt: r.createdAt,
                lastError: r.lastError,
                idempotencyKey: r.idempotencyKey,
                type: r.type,
                payload: meta,
            };
        });
        return res.json({ items: redacted });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
