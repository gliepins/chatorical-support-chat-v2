"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashIp = hashIp;
exports.signConversationToken = signConversationToken;
exports.verifyConversationToken = verifyConversationToken;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function hashIp(ipAddress) {
    return crypto_1.default.createHash('sha256').update(ipAddress).digest('hex');
}
function getJwtSecret() {
    const s = env_1.CONFIG.jwtSecret;
    if (!s || s.length < 16) {
        throw new Error('Missing or weak CONVERSATION_JWT_SECRET');
    }
    return s;
}
function signConversationToken(tenantId, conversationId, ipHash, ttlSeconds = 3600) {
    const secret = getJwtSecret();
    const payload = { t: tenantId, sub: conversationId };
    const unbind = String(process.env.UNBIND_JWT_FROM_IP || '').toLowerCase() === 'true';
    if (!unbind)
        payload.ip = ipHash;
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: ttlSeconds });
}
function verifyConversationToken(token, ipHash) {
    const secret = getJwtSecret();
    const payload = jsonwebtoken_1.default.verify(token, secret);
    if (!payload || typeof payload.sub !== 'string' || typeof payload.t !== 'string') {
        throw new Error('Invalid token payload');
    }
    if (typeof payload.ip === 'string') {
        if (!ipHash || payload.ip !== ipHash) {
            throw new Error('IP mismatch');
        }
    }
    return { tenantId: payload.t, conversationId: payload.sub };
}
