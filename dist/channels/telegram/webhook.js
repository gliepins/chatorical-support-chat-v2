"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramRouter = telegramRouter;
const express_1 = require("express");
const adapter_1 = require("./adapter");
const logger_1 = require("../../telemetry/logger");
const conversationRepo_1 = require("../../repositories/conversationRepo");
const hub_1 = require("../../ws/hub");
function telegramRouter() {
    const router = (0, express_1.Router)();
    router.post('/v1/telegram/webhook/:secret', async (req, res) => {
        const secret = req.params.secret;
        try {
            const row = await (0, adapter_1.getTelegramConfigByWebhookSecret)(secret);
            if (!row)
                return res.status(404).json({ ok: false });
            const headerSecret = row.config.headerSecret;
            if (headerSecret) {
                const provided = req.header('x-telegram-bot-api-secret-token');
                if (provided !== headerSecret)
                    return res.status(401).json({ ok: false });
            }
            const update = req.body;
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
                        let conv = await (0, conversationRepo_1.findConversationByThreadId)(tenantId, threadId);
                        if (!conv)
                            conv = await (0, conversationRepo_1.createConversationWithThread)(tenantId, threadId, msg.chat.title);
                        if (conv) {
                            try {
                                const created = await (0, conversationRepo_1.addAgentOutboundMessage)(tenantId, conv.id, text);
                                try {
                                    (0, hub_1.broadcastToConversation)(conv.id, { direction: 'OUTBOUND', text: created?.text });
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
                        const conv = await (0, conversationRepo_1.findOrCreateRootConversation)(tenantId, msg.chat.title);
                        if (conv) {
                            try {
                                const created = await (0, conversationRepo_1.addAgentOutboundMessage)(tenantId, conv.id, text);
                                try {
                                    (0, hub_1.broadcastToConversation)(conv.id, { direction: 'OUTBOUND', text: created?.text });
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
            return res.json({ ok: true });
        }
        catch (e) {
            // Maintain v1 behavior: return ok even on parse errors
            return res.json({ ok: true });
        }
    });
    return router;
}
