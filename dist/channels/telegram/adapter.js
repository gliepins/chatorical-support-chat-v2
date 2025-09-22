"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertTelegramChannel = upsertTelegramChannel;
exports.getTelegramConfigByWebhookSecret = getTelegramConfigByWebhookSecret;
exports.getTelegramConfigByHeaderSecret = getTelegramConfigByHeaderSecret;
exports.sendTelegramText = sendTelegramText;
exports.sendTelegramTextInThread = sendTelegramTextInThread;
exports.createTelegramForumTopic = createTelegramForumTopic;
const client_1 = require("../../db/client");
const crypto_1 = require("../../services/crypto");
// Use global fetch in Node 18+; fallback to dynamic import if needed
const fetchFn = globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined;
const metrics_1 = require("../../telemetry/metrics");
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
async function getTelegramConfigByHeaderSecret(tenantId, headerSecret) {
    const prisma = (0, client_1.getPrisma)();
    const row = await prisma.channel.findFirst({ where: { tenantId, type: 'telegram', headerSecret } });
    if (!row)
        return null;
    const cfg = (0, crypto_1.decryptJsonEnvelope)(row.encConfig);
    return { tenantId: row.tenantId, config: cfg };
}
async function sendTelegramText(botToken, chatId, text) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = { chat_id: chatId, text, disable_notification: true };
    let attempts = 0;
    // up to 3 attempts with respect to retry_after
    while (attempts < 3) {
        attempts++;
        try {
            const fetchImpl = fetchFn || (async () => { throw new Error('fetch not available'); });
            const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
            if (res && typeof res.json === 'function') {
                const data = await res.json();
                if (data && data.ok === true) {
                    (0, metrics_1.incTelegramSends)(1);
                    return;
                }
                const retryAfter = Number(data?.parameters?.retry_after || 0);
                if (retryAfter > 0 && attempts < 3) {
                    await new Promise(r => setTimeout(r, Math.min((retryAfter + 1) * 1000, 15000)));
                    continue;
                }
                (0, metrics_1.incTelegramErrors)(1);
                return;
            }
            // Non-JSON response
            (0, metrics_1.incTelegramErrors)(1);
            return;
        }
        catch {
            (0, metrics_1.incTelegramErrors)(1);
            return;
        }
    }
}
async function sendTelegramTextInThread(botToken, chatId, threadId, text) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = { chat_id: chatId, text, disable_notification: true };
    if (typeof threadId === 'number' && Number.isFinite(threadId))
        body.message_thread_id = threadId;
    let attempts = 0;
    const fetchImpl = fetchFn || (async () => { throw new Error('fetch not available'); });
    while (attempts < 3) {
        attempts++;
        try {
            const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
            if (res && typeof res.json === 'function') {
                const data = await res.json();
                if (data && data.ok === true) {
                    (0, metrics_1.incTelegramSends)(1);
                    return;
                }
                const retryAfter = Number(data?.parameters?.retry_after || 0);
                if (retryAfter > 0 && attempts < 3) {
                    await new Promise(r => setTimeout(r, Math.min((retryAfter + 1) * 1000, 15000)));
                    continue;
                }
                (0, metrics_1.incTelegramErrors)(1);
                return;
            }
            (0, metrics_1.incTelegramErrors)(1);
            return;
        }
        catch {
            (0, metrics_1.incTelegramErrors)(1);
            return;
        }
    }
}
async function createTelegramForumTopic(botToken, chatId, name) {
    const url = `https://api.telegram.org/bot${botToken}/createForumTopic`;
    const body = { chat_id: chatId, name };
    try {
        const fetchImpl = fetchFn || (async () => { throw new Error('fetch not available'); });
        const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (res && typeof res.json === 'function') {
            const data = await res.json();
            if (data && data.ok === true) {
                // Telegram returns result.message_thread_id for created topic
                const tid = Number(data?.result?.message_thread_id);
                if (Number.isFinite(tid))
                    return tid;
            }
        }
    }
    catch {
        // ignore — fall back to group root
    }
    return undefined;
}
