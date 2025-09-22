import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';

const router = Router();

// GET /v1/admin/settings/:tenantSlug
router.get('/v1/admin/settings/:tenantSlug', requireServiceOrApiKey(['admin:read']), async (req, res) => {
  try {
    const slug = req.params.tenantSlug;
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const rows = await (prisma as any).setting.findMany({ where: { tenantId: t.id }, orderBy: { key: 'asc' } });
    const entries: Record<string, string> = {};
    for (const r of rows) entries[r.key] = r.value;
    return res.json({ settings: entries });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// POST /v1/admin/settings/upsert { tenantSlug, key, value }
router.post('/v1/admin/settings/upsert', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, key, value } = (req.body || {}) as { tenantSlug?: string; key?: string; value?: string };
    if (!tenantSlug || !key || typeof value !== 'string') return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId: t.id, key } }, update: { value }, create: { tenantId: t.id, key, value } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;


