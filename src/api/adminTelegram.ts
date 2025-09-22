import { Router } from 'express';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { decryptJsonEnvelope } from '../services/crypto';
import { sendTelegramText } from '../channels/telegram/adapter';

const router = Router();
router.use(requireServiceAuth);

// POST /v1/admin/telegram/send { tenantSlug, chatId, text }
router.post('/v1/admin/telegram/send', async (req, res) => {
  try {
    const { tenantSlug, chatId, text } = (req.body || {}) as { tenantSlug?: string; chatId?: number | string; text?: string };
    if (!tenantSlug || !chatId || !text) return res.status(400).json({ error: 'missing_params' });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const ch = await (prisma as any).channel.findFirst({ where: { tenantId: t.id, type: 'telegram' } });
    if (!ch) return res.status(404).json({ error: 'telegram_channel_not_found' });
    const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string };
    await sendTelegramText(cfg.botToken, chatId as any, text);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

export default router;


