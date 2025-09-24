import { Router } from 'express';
import { requireServiceOrApiKey, requireServiceAuth } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { decryptJsonEnvelope } from '../services/crypto';
import { sendTelegramText, sendTelegramTextInThread, upsertTelegramChannel, enqueueTelegramTextInThread } from '../channels/telegram/adapter';
import { ensureTopicForConversation } from '../channels/telegram/topic';
import { enqueueOutbox } from '../services/outbox';
import { randomUUID } from 'crypto';

const router = Router();

// POST /v1/admin/telegram/send { tenantSlug, chatId, text, conversationId? }
router.post('/v1/admin/telegram/send', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, chatId, text, conversationId } = (req.body || {}) as { tenantSlug?: string; chatId?: number | string; text?: string; conversationId?: string };
    if (!tenantSlug || !chatId || !text) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const ch = await (prisma as any).channel.findFirst({ where: { tenantId: t.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
    if (!ch) return res.status(404).json({ error: { code: 'telegram_channel_not_found' } });
    const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string };
    if (conversationId && typeof conversationId === 'string' && conversationId.trim().length > 0) {
      let threadId: number | undefined;
      try { threadId = await ensureTopicForConversation(t.id, conversationId.trim()); } catch {}
      if (typeof threadId === 'number' && Number.isFinite(threadId)) {
        await enqueueTelegramTextInThread(t.id, chatId, threadId, String(text || ''), randomUUID());
      } else {
        await enqueueOutbox(t.id, 'telegram_send', { chatId, text }, randomUUID());
      }
    } else {
      // Default to tenant-level defaultTopicId when no conversationId is provided
      let threadId: number | undefined;
      try {
        const rows = await (getPrisma() as any).setting.findMany({ where: { tenantId: t.id, key: 'telegram.defaultTopicId' } });
        const val = rows && rows[0] && rows[0].value ? Number(rows[0].value) : NaN;
        if (Number.isFinite(val)) threadId = val;
      } catch {}
      if (typeof threadId === 'number') {
        await enqueueTelegramTextInThread(t.id, chatId, threadId, String(text || ''), randomUUID());
      } else {
        await enqueueOutbox(t.id, 'telegram_send', { chatId, text }, randomUUID());
      }
    }
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;

// POST /v1/admin/telegram/config { tenantSlug, botToken, supportGroupId, webhookSecret, headerSecret? }
router.post('/v1/admin/telegram/config', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, botToken, supportGroupId, webhookSecret, headerSecret } = (req.body || {}) as { tenantSlug?: string; botToken?: string; supportGroupId?: string | number; webhookSecret?: string; headerSecret?: string };
    if (!tenantSlug || !botToken || !supportGroupId || !webhookSecret) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    await upsertTelegramChannel(t.id, { botToken, supportGroupId: String(supportGroupId), headerSecret }, webhookSecret);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// POST /v1/admin/telegram/verify { tenantSlug }
router.post('/v1/admin/telegram/verify', requireServiceOrApiKey(['admin:read']), async (req, res) => {
  try {
    const { tenantSlug } = (req.body || {}) as { tenantSlug?: string };
    if (!tenantSlug) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const ch = await (prisma as any).channel.findFirst({ where: { tenantId: t.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
    if (!ch) return res.status(404).json({ error: { code: 'telegram_channel_not_found' } });
    const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string; supportGroupId?: string };
    const ok = Boolean(cfg && cfg.botToken && (cfg.botToken as any).length > 20);
    return res.json({ ok, hasSupportGroupId: Boolean(cfg.supportGroupId), hasHeaderSecret: Boolean(ch.headerSecret), webhookSecretSet: Boolean(ch.webhookSecret) });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// DEBUG: service-token only. Returns telegram channel secrets for troubleshooting on stage.
// POST /v1/admin/telegram/debug { tenantSlug }
router.post('/v1/admin/telegram/debug', requireServiceAuth, async (req, res) => {
  try {
    const { tenantSlug } = (req.body || {}) as { tenantSlug?: string };
    if (!tenantSlug) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const ch = await (prisma as any).channel.findFirst({ where: { tenantId: t.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
    if (!ch) return res.status(404).json({ error: { code: 'telegram_channel_not_found' } });
    const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string; supportGroupId?: string };
    return res.json({ tenantId: t.id, webhookSecret: ch.webhookSecret, headerSecret: ch.headerSecret, supportGroupId: cfg.supportGroupId });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// POST /v1/admin/conversations/set-thread { tenantSlug, conversationId, threadId }
router.post('/v1/admin/conversations/set-thread', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, conversationId, threadId } = (req.body || {}) as { tenantSlug?: string; conversationId?: string; threadId?: number | string };
    if (!tenantSlug || !conversationId || (threadId === undefined || threadId === null)) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const tid = Number(threadId);
    if (!Number.isFinite(tid) || tid <= 0) return res.status(400).json({ error: { code: 'bad_thread_id' } });
    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId: t.id } });
    if (!conv) return res.status(404).json({ error: { code: 'conversation_not_found' } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { threadId: tid } });
    return res.json({ ok: true, conversationId: conv.id, threadId: tid });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});


