import { Router } from 'express';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { createApiKey } from '../services/apiKeys';

const router = Router();
router.use(requireServiceAuth);

// POST /v1/admin/keys/issue { tenantSlug, name, scopes[] }
router.post('/v1/admin/keys/issue', async (req, res) => {
  try {
    const { tenantSlug, name, scopes } = (req.body || {}) as { tenantSlug?: string; name?: string; scopes?: string[] };
    if (!tenantSlug || !name) return res.status(400).json({ error: 'tenantSlug_and_name_required' });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const { plain, record } = await createApiKey(t.id, name, Array.isArray(scopes) ? scopes : []);
    return res.json({ apiKey: { id: record.id, tenantId: record.tenantId, name: record.name, scopes: record.scopes.split(',').filter(Boolean) }, secret: plain });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

// GET /v1/admin/keys/:tenantSlug
router.get('/v1/admin/keys/:tenantSlug', async (req, res) => {
  try {
    const slug = req.params.tenantSlug;
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const rows = await (prisma as any).apiKey.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'desc' } });
    return res.json({ keys: rows.map((r: any) => ({ id: r.id, name: r.name, scopes: (r.scopes || '').split(',').filter(Boolean), lastUsedAt: r.lastUsedAt })) });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

// DELETE /v1/admin/keys/:id
router.delete('/v1/admin/keys/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const prisma = getPrisma();
    await (prisma as any).apiKey.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

export default router;


