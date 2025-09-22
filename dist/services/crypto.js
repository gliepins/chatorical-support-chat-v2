"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptJsonEnvelope = encryptJsonEnvelope;
exports.decryptJsonEnvelope = decryptJsonEnvelope;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
function getMasterKey() {
    const raw = env_1.CONFIG.kmsMasterKey;
    if (!raw)
        throw new Error('KMS master key missing');
    // Accept base64 or hex; fallback to utf8 bytes
    try {
        return Buffer.from(raw, 'base64');
    }
    catch { }
    try {
        return Buffer.from(raw, 'hex');
    }
    catch { }
    return Buffer.from(raw, 'utf8');
}
function encryptJsonEnvelope(obj) {
    const mk = getMasterKey();
    const dek = crypto_1.default.randomBytes(32);
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', dek, iv);
    const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrapped = xorWrap(dek, mk);
    const payload = {
        v: 1,
        w: wrapped.toString('base64'),
        i: iv.toString('base64'),
        t: tag.toString('base64'),
        c: ciphertext.toString('base64'),
    };
    return JSON.stringify(payload);
}
function decryptJsonEnvelope(serialized) {
    const mk = getMasterKey();
    const payload = JSON.parse(serialized);
    const dek = xorUnwrap(Buffer.from(payload.w, 'base64'), mk);
    const iv = Buffer.from(payload.i, 'base64');
    const tag = Buffer.from(payload.t, 'base64');
    const ciphertext = Buffer.from(payload.c, 'base64');
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
}
function xorWrap(data, key) {
    const out = Buffer.allocUnsafe(data.length);
    for (let i = 0; i < data.length; i++)
        out[i] = data[i] ^ key[i % key.length];
    return out;
}
function xorUnwrap(wrapped, key) {
    return xorWrap(wrapped, key);
}
