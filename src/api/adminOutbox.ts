import { Router } from 'express';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { enqueueOutbox } from '../services/outbox';

const router = Router();
router.use(requireServiceAuth);

// POST /v1/admin/outbox/telegram { tenantSlug, chatId, text, idempotencyKey? }
router.post('/v1/admin/outbox/telegram', async (req, res) => {
  try {
    const { tenantSlug, chatId, text, idempotencyKey } = (req.body || {}) as { tenantSlug?: string; chatId?: number | string; text?: string; idempotencyKey?: string };
    if (!tenantSlug || !chatId || !text) return res.status(400).json({ error: 'missing_params' });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const item = await enqueueOutbox(t.id, 'telegram_send', { chatId, text }, idempotencyKey);
    return res.json({ id: item.id, status: 'enqueued' });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

export default router;


