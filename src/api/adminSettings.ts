import { Router } from 'express';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';

const router = Router();
router.use(requireServiceAuth);

// GET /v1/admin/settings/:tenantSlug
router.get('/v1/admin/settings/:tenantSlug', async (req, res) => {
  try {
    const slug = req.params.tenantSlug;
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const rows = await (prisma as any).setting.findMany({ where: { tenantId: t.id }, orderBy: { key: 'asc' } });
    const entries: Record<string, string> = {};
    for (const r of rows) entries[r.key] = r.value;
    return res.json({ settings: entries });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

// POST /v1/admin/settings/upsert { tenantSlug, key, value }
router.post('/v1/admin/settings/upsert', async (req, res) => {
  try {
    const { tenantSlug, key, value } = (req.body || {}) as { tenantSlug?: string; key?: string; value?: string };
    if (!tenantSlug || !key || typeof value !== 'string') return res.status(400).json({ error: 'missing_params' });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId: t.id, key } }, update: { value }, create: { tenantId: t.id, key, value } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

export default router;


