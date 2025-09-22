import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';

const router = Router();

// GET /v1/admin/audit/:tenantSlug/export?from=ISO&to=ISO
router.get('/v1/admin/audit/:tenantSlug/export', requireServiceOrApiKey(['admin:read']), async (req, res) => {
  try {
    const slug = req.params.tenantSlug;
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const fromStr = String((req.query as any).from || '');
    const toStr = String((req.query as any).to || '');
    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = toStr ? new Date(toStr) : new Date();
    const rows = await (prisma as any).auditLog.findMany({ where: { tenantId: t.id, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' } });
    res.header('content-type', 'application/json');
    return res.json({ tenantId: t.id, from: from.toISOString(), to: to.toISOString(), entries: rows });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;


