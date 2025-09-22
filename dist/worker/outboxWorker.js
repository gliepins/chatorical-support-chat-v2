"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processOnce = processOnce;
const outbox_1 = require("../services/outbox");
const adapter_1 = require("../channels/telegram/adapter");
const client_1 = require("../db/client");
const crypto_1 = require("../services/crypto");
const tracing_1 = require("../telemetry/tracing");
async function processOnce() {
    const item = await (0, outbox_1.claimNextOutbox)(new Date());
    if (!item)
        return false;
    try {
        if (item.type === 'telegram_send') {
            const { tenantId, payload } = item;
            const prisma = (0, client_1.getPrisma)();
            const ch = await (0, tracing_1.runWithSpan)('outbox.lookupChannel', () => prisma.channel.findFirst({ where: { tenantId, type: 'telegram' } }), { tenant_id: tenantId });
            if (!ch)
                throw new Error('telegram_channel_missing');
            const cfg = (0, crypto_1.decryptJsonEnvelope)(ch.encConfig);
            await (0, tracing_1.runWithSpan)('outbox.sendTelegramText', () => (0, adapter_1.sendTelegramText)(cfg.botToken, payload.chatId, payload.text), { chat_id: payload.chatId });
        }
        await (0, outbox_1.markDone)(item.id);
    }
    catch (e) {
        const msg = e?.message || 'error';
        const backoff = 2; // simple backoff; could expand based on attempts
        await (0, outbox_1.markFailed)(item.id, msg, backoff);
    }
    return true;
}
