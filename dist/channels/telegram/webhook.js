"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramRouter = telegramRouter;
const express_1 = require("express");
const adapter_1 = require("./adapter");
const client_1 = require("../../db/client");
const logger_1 = require("../../telemetry/logger");
const metrics_1 = require("../../telemetry/metrics");
const conversationRepo_1 = require("../../repositories/conversationRepo");
const redisHub_1 = require("../../ws/redisHub");
const kv_1 = require("../../redis/kv");
const env_1 = require("../../config/env");
const tracing_1 = require("../../telemetry/tracing");
const settings_1 = require("../../services/settings");
const rateLimit_1 = require("../../middleware/rateLimit");
function telegramRouter() {
    const router = (0, express_1.Router)();
    router.post('/v1/telegram/webhook/:secret', async (req, res) => {
        const t0 = Date.now();
        const secret = req.params.secret;
        try {
            let row = await (0, tracing_1.runWithSpan)('telegram.webhook.lookup', () => (0, adapter_1.getTelegramConfigByWebhookSecret)(secret), { secret_present: Boolean(secret) });
            if (!row)
                return res.status(404).json({ ok: false });
            // Per-tenant rate limit if configured: rl.telegram_webhook.{points,durationSec}
            try {
                const pStr = await (0, settings_1.getSetting)(row.tenantId, 'rl.telegram_webhook.points');
                const dStr = await (0, settings_1.getSetting)(row.tenantId, 'rl.telegram_webhook.durationSec');
                const p = pStr ? Number(pStr) : 0;
                const d = dStr ? Number(dStr) : 0;
                if (p > 0 && d > 0) {
                    // Execute limiter inline (not as middleware) to avoid re-routing
                    const limiter = (0, rateLimit_1.ipRateLimit)(p, d, 'telegram_webhook');
                    let halted = false;
                    await new Promise((resolve) => limiter(req, {
                        ...res,
                        status: (code) => { if (code === 429)
                            halted = true; return res.status(code); },
                        json: (body) => { res.json(body); resolve(); return res; },
                    }, () => resolve()));
                    if (halted)
                        return; // limiter already responded 429
                }
            }
            catch { }
            const headerSecret = row.config.headerSecret;
            if (headerSecret) {
                const provided = req.header('x-telegram-bot-api-secret-token');
                if (provided !== headerSecret) {
                    // Fallback: if header secret mismatched, verify if the request belongs to any telegram channel for this tenant by header
                    try {
                        const prisma = (0, client_1.getPrisma)();
                        const alt = await prisma.channel.findFirst({ where: { tenantId: row.tenantId, type: 'telegram', headerSecret: provided } });
                        if (!alt) {
                            try {
                                (0, metrics_1.incTelegramWebhookUnauthorized)(1);
                            }
                            catch { }
                            return res.status(401).json({ ok: false });
                        }
                    }
                    catch {
                        try {
                            (0, metrics_1.incTelegramWebhookUnauthorized)(1);
                        }
                        catch { }
                        return res.status(401).json({ ok: false });
                    }
                }
            }
            // Feature flag: disable inbound processing per tenant (after auth and rate limiting)
            try {
                const disabled = await (0, settings_1.getBooleanSetting)(row.tenantId, 'flags.telegram.disableInbound', false);
                if (disabled) {
                    try {
                        (0, metrics_1.incTelegramWebhookOk)(1);
                    }
                    catch { }
                    return res.json({ ok: true });
                }
            }
            catch { }
            const update = req.body;
            // Idempotency: ignore duplicate update_id per tenant for a short TTL
            const updateId = (update && typeof update.update_id === 'number') ? update.update_id : undefined;
            if (updateId) {
                try {
                    const redis = (0, kv_1.getRedis)();
                    const key = `${env_1.CONFIG.redisKeyPrefix}tg:idu:${row.tenantId}:${updateId}`;
                    const created = await redis.setnx(key, '1');
                    if (created === 0) {
                        try {
                            (0, metrics_1.incTelegramWebhookIdempotentSkipped)(1);
                        }
                        catch { }
                        return res.json({ ok: true });
                    }
                    await redis.expire(key, 120);
                }
                catch { }
            }
            try {
                const debug = {
                    has_message: !!(update && (update.message || update.edited_message)),
                    chat_type: update?.message?.chat?.type || update?.edited_message?.chat?.type,
                    thread_id: update?.message?.message_thread_id || update?.edited_message?.message_thread_id,
                    text_len: (update?.message?.text || update?.edited_message?.text || '').length,
                };
                logger_1.logger.info({ debug }, 'telegram update received');
            }
            catch { }
            const tenantId = row.tenantId;
            const msg = update && (update.message || update.edited_message);
            if (msg && msg.chat && msg.chat.type === 'supergroup') {
                const threadId = msg.message_thread_id;
                const text = msg.text || msg.caption;
                if (typeof text === 'string') {
                    try {
                        logger_1.logger.info({ threadId, textPreview: text.slice(0, 40) }, 'telegram msg parsed');
                    }
                    catch { }
                    if (threadId) {
                        let conv = await (0, tracing_1.runWithSpan)('telegram.ensureThread', async () => {
                            let c = await (0, conversationRepo_1.findConversationByThreadId)(tenantId, threadId);
                            if (!c)
                                c = await (0, conversationRepo_1.createConversationWithThread)(tenantId, threadId, msg.chat.title);
                            return c;
                        }, { thread_id: threadId });
                        if (conv) {
                            try {
                                const created = await (0, tracing_1.runWithSpan)('telegram.persistMessage', () => (0, conversationRepo_1.addAgentInboundMessage)(tenantId, conv.id, text), { conv_id: conv.id });
                                try {
                                    await (0, redisHub_1.publishToConversation)(conv.id, { direction: 'OUTBOUND', text: created?.text, createdAt: created?.createdAt });
                                }
                                catch { }
                            }
                            catch (e) {
                                try {
                                    logger_1.logger.warn({ err: e }, 'persist topic msg failed');
                                }
                                catch { }
                            }
                        }
                    }
                    else {
                        const conv = await (0, tracing_1.runWithSpan)('telegram.ensureRoot', () => (0, conversationRepo_1.findOrCreateRootConversation)(tenantId, msg.chat.title));
                        if (conv) {
                            try {
                                const created = await (0, tracing_1.runWithSpan)('telegram.persistMessage', () => (0, conversationRepo_1.addAgentInboundMessage)(tenantId, conv.id, text), { conv_id: conv.id });
                                try {
                                    await (0, redisHub_1.publishToConversation)(conv.id, { direction: 'OUTBOUND', text: created?.text, createdAt: created?.createdAt });
                                }
                                catch { }
                            }
                            catch (e) {
                                try {
                                    logger_1.logger.warn({ err: e }, 'persist root msg failed');
                                }
                                catch { }
                            }
                        }
                    }
                }
            }
            try {
                (0, metrics_1.incTelegramWebhookOk)(1);
                (0, metrics_1.recordTelegramWebhookLatency)(Date.now() - t0);
            }
            catch { }
            return res.json({ ok: true });
        }
        catch (e) {
            // Maintain v1 behavior: return ok even on parse errors
            try {
                (0, metrics_1.incTelegramWebhookParseErrors)(1);
                (0, metrics_1.recordTelegramWebhookLatency)(Date.now() - t0);
            }
            catch { }
            return res.json({ ok: true });
        }
    });
    return router;
}
