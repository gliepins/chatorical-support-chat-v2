"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertTelegramChannel = upsertTelegramChannel;
exports.getTelegramConfigByWebhookSecret = getTelegramConfigByWebhookSecret;
const client_1 = require("../../db/client");
const crypto_1 = require("../../services/crypto");
async function upsertTelegramChannel(tenantId, config, webhookSecret) {
    const prisma = (0, client_1.getPrisma)();
    const enc = (0, crypto_1.encryptJsonEnvelope)(config);
    const row = await prisma.channel.upsert({
        where: { webhookSecret },
        update: { encConfig: enc, headerSecret: config.headerSecret || null },
        create: { tenantId, type: 'telegram', encConfig: enc, webhookSecret, headerSecret: config.headerSecret || null },
    });
    return row;
}
async function getTelegramConfigByWebhookSecret(webhookSecret) {
    const prisma = (0, client_1.getPrisma)();
    const row = await prisma.channel.findUnique({ where: { webhookSecret } });
    if (!row)
        return null;
    const cfg = (0, crypto_1.decryptJsonEnvelope)(row.encConfig);
    return { tenantId: row.tenantId, config: cfg };
}
