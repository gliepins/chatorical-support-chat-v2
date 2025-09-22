"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApiKeyPlain = generateApiKeyPlain;
exports.hashApiKey = hashApiKey;
exports.createApiKey = createApiKey;
exports.verifyApiKey = verifyApiKey;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../db/client");
function generateApiKeyPlain() {
    return `scv2_${crypto_1.default.randomBytes(24).toString('base64url')}`;
}
function hashApiKey(plain) {
    const salt = 'scv2.ak.v1';
    return crypto_1.default.createHash('sha256').update(salt + ':' + plain).digest('hex');
}
async function createApiKey(tenantId, name, scopes) {
    const prisma = (0, client_1.getPrisma)();
    const plain = generateApiKeyPlain();
    const hashed = hashApiKey(plain);
    const record = await prisma.apiKey.create({ data: { tenantId, name, hashedKey: hashed, scopes: scopes.join(',') } });
    return { plain, record };
}
async function verifyApiKey(plain) {
    const prisma = (0, client_1.getPrisma)();
    const hashed = hashApiKey(plain);
    const row = await prisma.apiKey.findFirst({ where: { hashedKey: hashed } });
    if (!row)
        return null;
    try {
        await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    }
    catch { }
    return row;
}
