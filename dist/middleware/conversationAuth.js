"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireConversationAuth = requireConversationAuth;
const auth_1 = require("../services/auth");
function requireConversationAuth(req, res, next) {
    const header = req.header('authorization') || '';
    const token = header.toLowerCase().startsWith('bearer ')
        ? header.slice(7)
        : '';
    if (!token)
        return res.status(401).json({ error: { code: 'unauthorized', message: 'missing_token' } });
    try {
        const ipHash = (0, auth_1.hashIp)((req.ip || '').toString());
        const parsed = (0, auth_1.verifyConversationToken)(token, ipHash);
        req.conversation = parsed;
        const paramId = req.params.id;
        if (paramId && parsed.conversationId !== paramId) {
            return res.status(403).json({ error: { code: 'forbidden', message: 'conversation_mismatch' } });
        }
        return next();
    }
    catch {
        return res.status(401).json({ error: { code: 'unauthorized', message: 'invalid_token' } });
    }
}
