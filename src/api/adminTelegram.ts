import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { decryptJsonEnvelope } from '../services/crypto';
import { sendTelegramText, upsertTelegramChannel } from '../channels/telegram/adapter';

const router = Router();

// POST /v1/admin/telegram/send { tenantSlug, chatId, text }
router.post('/v1/admin/telegram/send', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, chatId, text } = (req.body || {}) as { tenantSlug?: string; chatId?: number | string; text?: string };
    if (!tenantSlug || !chatId || !text) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const ch = await (prisma as any).channel.findFirst({ where: { tenantId: t.id, type: 'telegram' } });
    if (!ch) return res.status(404).json({ error: { code: 'telegram_channel_not_found' } });
    const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string };
    await sendTelegramText(cfg.botToken, chatId as any, text);
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


