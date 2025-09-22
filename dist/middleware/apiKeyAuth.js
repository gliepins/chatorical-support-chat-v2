"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuth = apiKeyAuth;
const apiKeys_1 = require("../services/apiKeys");
async function apiKeyAuth(req, _res, next) {
    const header = req.header('authorization') || req.header('x-api-key') || '';
    const token = header.toLowerCase().startsWith('bearer ')
        ? header.slice(7)
        : header;
    if (!token)
        return next();
    try {
        const rec = await (0, apiKeys_1.verifyApiKey)(token);
        if (rec) {
            req.apiKey = { id: rec.id, tenantId: rec.tenantId, scopes: rec.scopes.split(',').filter(Boolean) };
        }
    }
    catch { }
    return next();
}
