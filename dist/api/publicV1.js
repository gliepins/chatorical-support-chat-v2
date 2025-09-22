"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../services/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const conversationRepo_1 = require("../repositories/conversationRepo");
const router = (0, express_1.Router)();
const START_POINTS = Number(process.env.START_IP_POINTS || 20);
const START_DURATION = Number(process.env.START_IP_DURATION_SEC || 60);
router.post('/v1/conversations/start', (0, rateLimit_1.ipRateLimit)(START_POINTS, START_DURATION, 'start'), async (req, res) => {
    try {
        const { name, locale } = (req.body || {});
        const tenantId = req.tenant?.tenantId || 'default';
        const conv = await (0, conversationRepo_1.createConversation)(tenantId, name, locale);
        const ipHash = (0, auth_1.hashIp)((req.ip || '').toString());
        const token = (0, auth_1.signConversationToken)(tenantId, conv.id, ipHash);
        return res.json({ conversation_id: conv.id, token, codename: conv.codename });
    }
    catch (e) {
        return res.status(400).json({ error: e?.message || 'bad request' });
    }
});
router.get('/v1/conversations/:id/messages', async (req, res) => {
    try {
        const tenantId = req.tenant?.tenantId || 'default';
        const msgs = await (0, conversationRepo_1.listMessages)(tenantId, req.params.id);
        return res.json({ status: 'OPEN_UNCLAIMED', messages: msgs });
    }
    catch (e) {
        return res.status(400).json({ error: 'bad request' });
    }
});
exports.default = router;
