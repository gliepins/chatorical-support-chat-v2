import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { enqueueOutbox } from '../services/outbox';

const router = Router();

// POST /v1/admin/outbox/telegram { tenantSlug, chatId, text, idempotencyKey? }
router.post('/v1/admin/outbox/telegram', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, chatId, text, idempotencyKey } = (req.body || {}) as { tenantSlug?: string; chatId?: number | string; text?: string; idempotencyKey?: string };
    if (!tenantSlug || !chatId || !text) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const item = await enqueueOutbox(t.id, 'telegram_send', { chatId, text }, idempotencyKey);
    return res.json({ id: item.id, status: 'enqueued' });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;


