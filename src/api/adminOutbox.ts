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
// GET /v1/admin/outbox (read-only list)
// Query: tenantSlug (required), status?, limit? (default 50), includePayload? (0/1)
router.get('/v1/admin/outbox', requireServiceOrApiKey(['admin:read','admin:write']), async (req, res) => {
  try {
    const tenantSlug = String((req.query as any)?.tenantSlug || '');
    if (!tenantSlug) return res.status(400).json({ error: { code: 'missing_params' } });
    const includePayloadRaw = String((req.query as any)?.includePayload || '0');
    const includePayload = includePayloadRaw === '1' || includePayloadRaw.toLowerCase() === 'true';
    const status = String((req.query as any)?.status || '');
    const limitNum = Math.max(1, Math.min(200, Number((req.query as any)?.limit || 50)));
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string; scopes: string[] } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const where: any = { tenantId: t.id };
    if (status) where.status = status;
    const rows = await (prisma as any).outbox.findMany({ where, orderBy: { createdAt: 'desc' }, take: limitNum });
    const canSeePayload = includePayload && !!(apiKey && Array.isArray(apiKey.scopes) && apiKey.scopes.includes('admin:write'));
    const redacted = rows.map((r: any) => {
      const payload = r.payload || {};
      const meta = {
        chatId: payload.chatId,
        message_thread_id: payload.message_thread_id,
        text: canSeePayload ? payload.text : undefined,
        text_redacted: canSeePayload ? false : (typeof payload.text === 'string'),
      };
      return {
        id: r.id,
        status: r.status,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt,
        createdAt: r.createdAt,
        lastError: r.lastError,
        idempotencyKey: r.idempotencyKey,
        type: r.type,
        payload: meta,
      };
    });
    return res.json({ items: redacted });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});



