"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const conversationRepo_1 = require("../repositories/conversationRepo");
const router = (0, express_1.Router)();
// POST /v1/admin/test/persist { tenantSlug: string, threadId?: number, text: string }
router.post('/v1/admin/test/persist', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, threadId, text } = (req.body || {});
        if (!tenantSlug || typeof tenantSlug !== 'string')
            return res.status(400).json({ error: { code: 'tenantSlug_required' } });
        if (!text || typeof text !== 'string')
            return res.status(400).json({ error: { code: 'text_required' } });
        const prisma = (0, client_1.getPrisma)();
        const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!tenant)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        let conv;
        if (typeof threadId === 'number' && Number.isFinite(threadId)) {
            conv = await prisma.conversation.findFirst({ where: { tenantId: tenant.id, threadId } });
            if (!conv)
                conv = await (0, conversationRepo_1.createConversationWithThread)(tenant.id, threadId, `Test for ${tenantSlug}`);
        }
        else {
            conv = await (0, conversationRepo_1.findOrCreateRootConversation)(tenant.id, `Root for ${tenantSlug}`);
        }
        const msg = await (0, conversationRepo_1.addAgentOutboundMessage)(tenant.id, conv.id, text);
        return res.json({ conversation: { id: conv.id, threadId: conv.threadId, codename: conv.codename }, message: msg });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
