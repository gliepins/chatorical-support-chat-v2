import { Router } from 'express';
import { hashIp, signConversationToken } from '../services/auth';
import { dynamicIpRateLimit } from '../middleware/rateLimit';
import { requireConversationAuth } from '../middleware/conversationAuth';
import { updateConversationName } from '../repositories/conversationRepo';
import { addCustomerInboundMessage } from '../repositories/conversationRepo';
import { setConversationThreadId } from '../repositories/conversationRepo';
import { getPrisma } from '../db/client';
import { decryptJsonEnvelope } from '../services/crypto';
import { sendTelegramTextInThread, createTelegramForumTopic, enqueueTelegramTextInThread } from '../channels/telegram/adapter';
import { getSetting } from '../services/settings';
import { createConversation, listMessages, getConversationById, countActiveConversations } from '../repositories/conversationRepo';
import { getBooleanSetting } from '../services/settings';
import { ensureTopicForConversation } from '../channels/telegram/topic';
import { getTenantPlanKey, getPlanFeatures, featureNumberOrUnlimited, featureBoolean } from '../services/plan';
import { getDailyMessages, incrDailyMessages, getDailyCounter, incrDailyCounter } from '../services/usage';
import { incOverLimitForTenant } from '../telemetry/metrics';

const router = Router();

const START_POINTS = Number(process.env.START_IP_POINTS || 20);
const START_DURATION = Number(process.env.START_IP_DURATION_SEC || 60);

router.post('/v1/conversations/start', dynamicIpRateLimit('start', START_POINTS, START_DURATION), async (req, res) => {
  try {
    const { name, locale } = (req.body || {}) as { name?: string; locale?: string };
    const tenantId: string = (req as any).tenant?.tenantId || 'default';
    // Plan-based limit: starts per day
    try {
      const planKey = await getTenantPlanKey(tenantId);
      if (planKey) {
        const features = await getPlanFeatures(planKey);
        const startLimit = featureNumberOrUnlimited(features, 'limits.starts_per_day');
        if (startLimit !== 'unlimited' && typeof startLimit === 'number' && startLimit >= 0) {
          const used = await getDailyCounter(tenantId, 'starts');
          if (used >= startLimit) {
            try { incOverLimitForTenant('starts_per_day', tenantId); } catch {}
            return res.status(429).json({ error: { code: 'over_limit', message: 'daily_starts_limit_reached' } });
          }
        }
      }
    } catch {}
    try {
      const disabled = await getBooleanSetting(tenantId, 'flags.public.disableStart', false);
      if (disabled) return res.status(403).json({ error: { code: 'disabled', message: 'start_disabled' } });
    } catch {}
    // Active conversations cap
    try {
      const planKey = await getTenantPlanKey(tenantId);
      if (planKey) {
        const features = await getPlanFeatures(planKey);
        const activeCap = featureNumberOrUnlimited(features, 'limits.active_conversations');
        if (activeCap !== 'unlimited' && typeof activeCap === 'number' && activeCap >= 0) {
          const activeNow = await countActiveConversations(tenantId);
          if (activeNow >= activeCap) {
            try { incOverLimitForTenant('active_conversations', tenantId); } catch {}
            return res.status(429).json({ error: { code: 'over_limit', message: 'active_conversations_cap_reached' } });
          }
        }
      }
    } catch {}
    const conv = await createConversation(tenantId, name, locale);
    try { res.setHeader('x-tenant-resolved', tenantId); } catch {}
    // Ensure Telegram topic at start (v1 parity). Ignore errors to avoid blocking start.
    try { await ensureTopicForConversation(tenantId, conv.id); } catch {}
    try { await incrDailyCounter(tenantId, 'starts'); } catch {}
    const ipHash = hashIp((req.ip || '').toString());
    const token = signConversationToken(tenantId, conv.id, ipHash);
    return res.json({ conversation_id: conv.id, token, codename: conv.codename, tenant_id: tenantId });
  } catch (e: any) {
    return res.status(400).json({ error: { code: 'bad_request', message: e?.message || 'bad request' } });
  }
});

router.get('/v1/conversations/:id/messages', async (req, res) => {
  try {
    const tenantId: string = (req as any).tenant?.tenantId || 'default';
    const conv = await getConversationById(tenantId, req.params.id);
    if (!conv) return res.status(404).json({ error: { code: 'not_found' } });
    const msgs = await listMessages(tenantId, req.params.id);
    // Optional since-cursor (ISO string or ms) to reduce reload flashes
    let filtered = msgs;
    try {
      const sinceRaw = (req.query && (req.query as any).since) ? String((req.query as any).since) : '';
      if (sinceRaw) {
        const sinceMs = isFinite(Number(sinceRaw)) ? Number(sinceRaw) : Date.parse(sinceRaw);
        if (isFinite(sinceMs)) {
          filtered = msgs.filter((m: any) => new Date(m.createdAt).getTime() > sinceMs);
        }
      }
    } catch {}
    return res.json({ status: 'OPEN_UNCLAIMED', messages: filtered });
  } catch (e: any) {
    return res.status(400).json({ error: { code: 'bad_request' } });
  }
});

// PATCH /v1/conversations/:id/name with tenant-aware rate limit: rl.rename.*
router.patch('/v1/conversations/:id/name', dynamicIpRateLimit('rename', 3, 24 * 60 * 60), requireConversationAuth, async (req, res) => {
  try {
    const tenantId: string = (req as any).tenant?.tenantId || 'default';
    const id = req.params.id;
    const { name } = (req.body || {}) as { name?: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'name_required' } });
    }
    // Plan-based limit: renames per day
    try {
      const planKey = await getTenantPlanKey(tenantId);
      if (planKey) {
        const features = await getPlanFeatures(planKey);
        const renameLimit = featureNumberOrUnlimited(features, 'limits.renames_per_day');
        if (renameLimit !== 'unlimited' && typeof renameLimit === 'number' && renameLimit >= 0) {
          const used = await getDailyCounter(tenantId, 'renames');
          if (used >= renameLimit) {
            try { incOverLimitForTenant('renames_per_day', tenantId); } catch {}
            return res.status(429).json({ error: { code: 'over_limit', message: 'daily_renames_limit_reached' } });
          }
        }
      }
    } catch {}
    const updated = await updateConversationName(tenantId, id, name.trim());
    try { await incrDailyCounter(tenantId, 'renames'); } catch {}
    return res.json({ ok: true, conversation: { id: updated.id, name: updated.customerName } });
  } catch (e: any) {
    return res.status(400).json({ error: { code: 'bad_request', message: e?.message } });
  }
});

// POST /v1/conversations/:id/messages — customer sends a message (JWT required)
router.post('/v1/conversations/:id/messages', requireConversationAuth, async (req, res) => {
  try {
    const tenantId: string = (req as any).tenant?.tenantId || 'default';
    const id = req.params.id;
    const { text } = (req.body || {}) as { text?: string };
    // Enforce plan-based daily message limit (tenant-wide)
    try {
      const planKey = await getTenantPlanKey(tenantId);
      if (planKey) {
        const features = await getPlanFeatures(planKey);
        const dailyLimit = featureNumberOrUnlimited(features, 'limits.messages_per_day');
        if (dailyLimit !== 'unlimited' && typeof dailyLimit === 'number' && dailyLimit >= 0) {
          const used = await getDailyMessages(tenantId, null);
          if (used >= dailyLimit) {
            try { incOverLimitForTenant('daily_messages', tenantId); } catch {}
            return res.status(429).json({ error: { code: 'over_limit', message: 'daily_messages_limit_reached' } });
          }
        }
      }
    } catch {}
    const msg = await addCustomerInboundMessage(tenantId, id, String(text || ''));
    try { res.setHeader('x-tenant-resolved', tenantId); } catch {}
    // Record usage after successful persist
    try { await incrDailyMessages(tenantId, null); } catch {}
    // Bridge to Telegram topic if configured
    try {
      // Check if telegram channel is allowed for plan
      let allowTelegram = true;
      try {
        const planKey = await getTenantPlanKey(tenantId);
        if (planKey) {
          const features = await getPlanFeatures(planKey);
          allowTelegram = featureBoolean(features, 'channels.telegram', true);
        }
      } catch {}
      if (!allowTelegram) {
        return res.json({ ok: true, message: { createdAt: msg.createdAt, direction: msg.direction, text: msg.text } });
      }
      const prisma = getPrisma();
      // Find telegram channel for tenant
      const ch = await (prisma as any).channel.findFirst({ where: { tenantId, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
      if (ch) {
        const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string; supportGroupId?: string };
        const conv = await getConversationById(tenantId, id);
        if (cfg && cfg.botToken && cfg.supportGroupId) {
          // If conversation has no threadId yet, ensure root/topic mapping exists only when the group supports topics
          let maybeThreadId: number | undefined = (conv as any)?.threadId || undefined;
          if (typeof maybeThreadId !== 'number') {
            // Attempt to auto-create a forum topic for this conversation
            try {
              const title = (conv as any)?.codename || 'Support';
              const createdTid = await createTelegramForumTopic(cfg.botToken, cfg.supportGroupId as any, String(title).slice(0, 128));
              if (typeof createdTid === 'number' && Number.isFinite(createdTid)) {
                maybeThreadId = createdTid;
              } else {
                // Fallback to default topic if configured
                const defTidStr = await getSetting(tenantId, 'telegram.defaultTopicId');
                const parsed = defTidStr ? Number(defTidStr) : NaN;
                if (Number.isFinite(parsed)) maybeThreadId = parsed;
              }
            } catch {
              try {
                const defTidStr = await getSetting(tenantId, 'telegram.defaultTopicId');
                const parsed = defTidStr ? Number(defTidStr) : NaN;
                if (Number.isFinite(parsed)) maybeThreadId = parsed;
              } catch {}
            }
          }
          // Enqueue for durable delivery (outbox worker) with idempotency key per customer message
          const idemKey = `conv_msg_out_${(msg as any)?.id || 'unknown'}`;
          try { await enqueueTelegramTextInThread(tenantId, cfg.supportGroupId as any, Number(maybeThreadId), String(text || ''), idemKey); } catch { await sendTelegramTextInThread(cfg.botToken, cfg.supportGroupId as any, maybeThreadId, String(text || '')); }
          // Persist mapping if we used a default topic
          if ((conv as any) && !(conv as any).threadId && typeof maybeThreadId === 'number') {
            try { await setConversationThreadId(tenantId, (conv as any).id, maybeThreadId); } catch {}
          }
          // We cannot get the assigned thread_id from sendMessage response here without additional fetch; leave mapping as-is
        }
      }
    } catch {}
    return res.json({ ok: true, message: { createdAt: msg.createdAt, direction: msg.direction, text: msg.text } });
  } catch (e: any) {
    return res.status(400).json({ error: { code: 'bad_request', message: e?.message } });
  }
});

export default router;


