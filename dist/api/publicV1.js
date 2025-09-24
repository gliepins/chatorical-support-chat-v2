"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../services/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const conversationAuth_1 = require("../middleware/conversationAuth");
const conversationRepo_1 = require("../repositories/conversationRepo");
const conversationRepo_2 = require("../repositories/conversationRepo");
const conversationRepo_3 = require("../repositories/conversationRepo");
const client_1 = require("../db/client");
const crypto_1 = require("../services/crypto");
const adapter_1 = require("../channels/telegram/adapter");
const settings_1 = require("../services/settings");
const conversationRepo_4 = require("../repositories/conversationRepo");
const settings_2 = require("../services/settings");
const topic_1 = require("../channels/telegram/topic");
const plan_1 = require("../services/plan");
const usage_1 = require("../services/usage");
const metrics_1 = require("../telemetry/metrics");
const router = (0, express_1.Router)();
const START_POINTS = Number(process.env.START_IP_POINTS || 20);
const START_DURATION = Number(process.env.START_IP_DURATION_SEC || 60);
router.post('/v1/conversations/start', (0, rateLimit_1.dynamicIpRateLimit)('start', START_POINTS, START_DURATION), async (req, res) => {
    try {
        const { name, locale } = (req.body || {});
        const tenantId = req.tenant?.tenantId || 'default';
        // Plan-based limit: starts per day
        try {
            const planKey = await (0, plan_1.getTenantPlanKey)(tenantId);
            if (planKey) {
                const features = await (0, plan_1.getPlanFeatures)(planKey);
                const startLimit = (0, plan_1.featureNumberOrUnlimited)(features, 'limits.starts_per_day');
                if (startLimit !== 'unlimited' && typeof startLimit === 'number' && startLimit >= 0) {
                    const used = await (0, usage_1.getDailyCounter)(tenantId, 'starts');
                    if (used >= startLimit) {
                        try {
                            (0, metrics_1.incOverLimitForTenant)('starts_per_day', tenantId);
                        }
                        catch { }
                        return res.status(429).json({ error: { code: 'over_limit', message: 'daily_starts_limit_reached' } });
                    }
                }
            }
        }
        catch { }
        try {
            const disabled = await (0, settings_2.getBooleanSetting)(tenantId, 'flags.public.disableStart', false);
            if (disabled)
                return res.status(403).json({ error: { code: 'disabled', message: 'start_disabled' } });
        }
        catch { }
        // Active conversations cap
        try {
            const planKey = await (0, plan_1.getTenantPlanKey)(tenantId);
            if (planKey) {
                const features = await (0, plan_1.getPlanFeatures)(planKey);
                const activeCap = (0, plan_1.featureNumberOrUnlimited)(features, 'limits.active_conversations');
                if (activeCap !== 'unlimited' && typeof activeCap === 'number' && activeCap >= 0) {
                    const activeNow = await (0, conversationRepo_4.countActiveConversations)(tenantId);
                    if (activeNow >= activeCap) {
                        try {
                            (0, metrics_1.incOverLimitForTenant)('active_conversations', tenantId);
                        }
                        catch { }
                        return res.status(429).json({ error: { code: 'over_limit', message: 'active_conversations_cap_reached' } });
                    }
                }
            }
        }
        catch { }
        const conv = await (0, conversationRepo_4.createConversation)(tenantId, name, locale);
        // Ensure Telegram topic at start (v1 parity). Ignore errors to avoid blocking start.
        try {
            await (0, topic_1.ensureTopicForConversation)(tenantId, conv.id);
        }
        catch { }
        try {
            await (0, usage_1.incrDailyCounter)(tenantId, 'starts');
        }
        catch { }
        const ipHash = (0, auth_1.hashIp)((req.ip || '').toString());
        const token = (0, auth_1.signConversationToken)(tenantId, conv.id, ipHash);
        return res.json({ conversation_id: conv.id, token, codename: conv.codename });
    }
    catch (e) {
        return res.status(400).json({ error: { code: 'bad_request', message: e?.message || 'bad request' } });
    }
});
router.get('/v1/conversations/:id/messages', async (req, res) => {
    try {
        const tenantId = req.tenant?.tenantId || 'default';
        const conv = await (0, conversationRepo_4.getConversationById)(tenantId, req.params.id);
        if (!conv)
            return res.status(404).json({ error: { code: 'not_found' } });
        const msgs = await (0, conversationRepo_4.listMessages)(tenantId, req.params.id);
        // Optional since-cursor (ISO string or ms) to reduce reload flashes
        let filtered = msgs;
        try {
            const sinceRaw = (req.query && req.query.since) ? String(req.query.since) : '';
            if (sinceRaw) {
                const sinceMs = isFinite(Number(sinceRaw)) ? Number(sinceRaw) : Date.parse(sinceRaw);
                if (isFinite(sinceMs)) {
                    filtered = msgs.filter((m) => new Date(m.createdAt).getTime() > sinceMs);
                }
            }
        }
        catch { }
        return res.json({ status: 'OPEN_UNCLAIMED', messages: filtered });
    }
    catch (e) {
        return res.status(400).json({ error: { code: 'bad_request' } });
    }
});
// PATCH /v1/conversations/:id/name with tenant-aware rate limit: rl.rename.*
router.patch('/v1/conversations/:id/name', (0, rateLimit_1.dynamicIpRateLimit)('rename', 3, 24 * 60 * 60), conversationAuth_1.requireConversationAuth, async (req, res) => {
    try {
        const tenantId = req.tenant?.tenantId || 'default';
        const id = req.params.id;
        const { name } = (req.body || {});
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: { code: 'bad_request', message: 'name_required' } });
        }
        // Plan-based limit: renames per day
        try {
            const planKey = await (0, plan_1.getTenantPlanKey)(tenantId);
            if (planKey) {
                const features = await (0, plan_1.getPlanFeatures)(planKey);
                const renameLimit = (0, plan_1.featureNumberOrUnlimited)(features, 'limits.renames_per_day');
                if (renameLimit !== 'unlimited' && typeof renameLimit === 'number' && renameLimit >= 0) {
                    const used = await (0, usage_1.getDailyCounter)(tenantId, 'renames');
                    if (used >= renameLimit) {
                        try {
                            (0, metrics_1.incOverLimitForTenant)('renames_per_day', tenantId);
                        }
                        catch { }
                        return res.status(429).json({ error: { code: 'over_limit', message: 'daily_renames_limit_reached' } });
                    }
                }
            }
        }
        catch { }
        const updated = await (0, conversationRepo_1.updateConversationName)(tenantId, id, name.trim());
        try {
            await (0, usage_1.incrDailyCounter)(tenantId, 'renames');
        }
        catch { }
        return res.json({ ok: true, conversation: { id: updated.id, name: updated.customerName } });
    }
    catch (e) {
        return res.status(400).json({ error: { code: 'bad_request', message: e?.message } });
    }
});
// POST /v1/conversations/:id/messages — customer sends a message (JWT required)
router.post('/v1/conversations/:id/messages', conversationAuth_1.requireConversationAuth, async (req, res) => {
    try {
        const tenantId = req.tenant?.tenantId || 'default';
        const id = req.params.id;
        const { text } = (req.body || {});
        // Enforce plan-based daily message limit (tenant-wide)
        try {
            const planKey = await (0, plan_1.getTenantPlanKey)(tenantId);
            if (planKey) {
                const features = await (0, plan_1.getPlanFeatures)(planKey);
                const dailyLimit = (0, plan_1.featureNumberOrUnlimited)(features, 'limits.messages_per_day');
                if (dailyLimit !== 'unlimited' && typeof dailyLimit === 'number' && dailyLimit >= 0) {
                    const used = await (0, usage_1.getDailyMessages)(tenantId, null);
                    if (used >= dailyLimit) {
                        try {
                            (0, metrics_1.incOverLimitForTenant)('daily_messages', tenantId);
                        }
                        catch { }
                        return res.status(429).json({ error: { code: 'over_limit', message: 'daily_messages_limit_reached' } });
                    }
                }
            }
        }
        catch { }
        const msg = await (0, conversationRepo_2.addCustomerInboundMessage)(tenantId, id, String(text || ''));
        // Record usage after successful persist
        try {
            await (0, usage_1.incrDailyMessages)(tenantId, null);
        }
        catch { }
        // Bridge to Telegram topic if configured
        try {
            // Check if telegram channel is allowed for plan
            let allowTelegram = true;
            try {
                const planKey = await (0, plan_1.getTenantPlanKey)(tenantId);
                if (planKey) {
                    const features = await (0, plan_1.getPlanFeatures)(planKey);
                    allowTelegram = (0, plan_1.featureBoolean)(features, 'channels.telegram', true);
                }
            }
            catch { }
            if (!allowTelegram) {
                return res.json({ ok: true, message: { createdAt: msg.createdAt, direction: msg.direction, text: msg.text } });
            }
            const prisma = (0, client_1.getPrisma)();
            // Find telegram channel for tenant
            const ch = await prisma.channel.findFirst({ where: { tenantId, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
            if (ch) {
                const cfg = (0, crypto_1.decryptJsonEnvelope)(ch.encConfig);
                const conv = await (0, conversationRepo_4.getConversationById)(tenantId, id);
                if (cfg && cfg.botToken && cfg.supportGroupId) {
                    // If conversation has no threadId yet, ensure root/topic mapping exists only when the group supports topics
                    let maybeThreadId = conv?.threadId || undefined;
                    if (typeof maybeThreadId !== 'number') {
                        // Attempt to auto-create a forum topic for this conversation
                        try {
                            const title = conv?.codename || 'Support';
                            const createdTid = await (0, adapter_1.createTelegramForumTopic)(cfg.botToken, cfg.supportGroupId, String(title).slice(0, 128));
                            if (typeof createdTid === 'number' && Number.isFinite(createdTid)) {
                                maybeThreadId = createdTid;
                            }
                            else {
                                // Fallback to default topic if configured
                                const defTidStr = await (0, settings_1.getSetting)(tenantId, 'telegram.defaultTopicId');
                                const parsed = defTidStr ? Number(defTidStr) : NaN;
                                if (Number.isFinite(parsed))
                                    maybeThreadId = parsed;
                            }
                        }
                        catch {
                            try {
                                const defTidStr = await (0, settings_1.getSetting)(tenantId, 'telegram.defaultTopicId');
                                const parsed = defTidStr ? Number(defTidStr) : NaN;
                                if (Number.isFinite(parsed))
                                    maybeThreadId = parsed;
                            }
                            catch { }
                        }
                    }
                    // Enqueue for durable delivery (outbox worker):
                    try {
                        await (0, adapter_1.enqueueTelegramTextInThread)(tenantId, cfg.supportGroupId, Number(maybeThreadId), String(text || ''));
                    }
                    catch {
                        await (0, adapter_1.sendTelegramTextInThread)(cfg.botToken, cfg.supportGroupId, maybeThreadId, String(text || ''));
                    }
                    // Persist mapping if we used a default topic
                    if (conv && !conv.threadId && typeof maybeThreadId === 'number') {
                        try {
                            await (0, conversationRepo_3.setConversationThreadId)(tenantId, conv.id, maybeThreadId);
                        }
                        catch { }
                    }
                    // We cannot get the assigned thread_id from sendMessage response here without additional fetch; leave mapping as-is
                }
            }
        }
        catch { }
        return res.json({ ok: true, message: { createdAt: msg.createdAt, direction: msg.direction, text: msg.text } });
    }
    catch (e) {
        return res.status(400).json({ error: { code: 'bad_request', message: e?.message } });
    }
});
exports.default = router;
