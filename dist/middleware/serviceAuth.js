"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireServiceAuth = requireServiceAuth;
exports.isServiceAuthenticated = isServiceAuthenticated;
exports.requireServiceOrApiKey = requireServiceOrApiKey;
const env_1 = require("../config/env");
const fs_1 = __importDefault(require("fs"));
function readS2SToken() {
    try {
        if (env_1.CONFIG.s2sToken)
            return env_1.CONFIG.s2sToken;
    }
    catch { }
    try {
        const p = process.env.S2S_TOKEN_FILE;
        if (p && fs_1.default.existsSync(p))
            return fs_1.default.readFileSync(p, 'utf8').trim();
    }
    catch { }
    return null;
}
function requireServiceAuth(req, res, next) {
    const provided = req.header('x-internal-auth');
    const token = readS2SToken();
    if (!token || !provided || provided !== token) {
        return res.status(401).json({ error: { code: 'unauthorized', message: 'missing_or_invalid_service_token' } });
    }
    return next();
}
function isServiceAuthenticated(req) {
    try {
        const provided = req.header('x-internal-auth');
        const token = readS2SToken();
        return !!token && !!provided && provided === token;
    }
    catch {
        return false;
    }
}
/**
 * Allows either internal service token OR API key with required scopes.
 * If no credentials are present → 401. If API key present but lacks scopes → 403.
 */
function requireServiceOrApiKey(requiredScopes = []) {
    const needed = Array.isArray(requiredScopes) ? requiredScopes.filter(Boolean) : [];
    return (req, res, next) => {
        // Service token bypass (legacy admin)
        if (isServiceAuthenticated(req))
            return next();
        // API key scopes path
        const apiKey = req.apiKey;
        if (!apiKey) {
            return res.status(401).json({ error: { code: 'unauthorized', message: 'api_key_required' } });
        }
        const have = new Set((apiKey.scopes || []).map((s) => s.trim()).filter(Boolean));
        const missing = needed.filter((s) => !have.has(s));
        if (missing.length > 0) {
            return res.status(403).json({ error: { code: 'insufficient_scope', message: 'missing_scopes', details: { required: needed, missing } } });
        }
        return next();
    };
}
