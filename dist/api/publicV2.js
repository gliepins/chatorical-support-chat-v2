"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const conversationAuth_1 = require("../middleware/conversationAuth");
const auth_1 = require("../services/auth");
const router = (0, express_1.Router)();
// Issue a short-lived WS token based on a valid conversation JWT
// POST /v2/ws/token
router.post('/v2/ws/token', conversationAuth_1.requireConversationAuth, async (req, res) => {
    try {
        const tenantId = req.conversation?.tenantId;
        const conversationId = req.conversation?.conversationId;
        if (!tenantId || !conversationId)
            return res.status(401).json({ error: { code: 'unauthorized' } });
        const ipHash = (0, auth_1.hashIp)((req.ip || '').toString());
        const ttl = 60; // seconds
        const token = (0, auth_1.signConversationToken)(tenantId, conversationId, ipHash, ttl);
        return res.json({ token, expires_in: ttl });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
