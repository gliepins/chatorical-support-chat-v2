"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireServiceAuth = requireServiceAuth;
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
        return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
}
