import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { ensureStripeCatalog, createCheckoutSessionForTenant, PlanSpec } from '../services/billing';

const router = Router();

// POST /v1/admin/billing/sync-catalog { plans: PlanSpec[] }
router.post('/v1/admin/billing/sync-catalog', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const body = (req.body || {}) as { plans?: PlanSpec[] };
    const plans = Array.isArray(body.plans) ? body.plans : [];
    if (plans.length === 0) return res.status(400).json({ error: { code: 'missing_plans' } });
    const synced = await ensureStripeCatalog(plans);
    return res.json({ ok: true, synced });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// POST /v1/admin/billing/checkout { tenantSlug, priceKey, successUrl, cancelUrl }
router.post('/v1/admin/billing/checkout', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, priceId, successUrl, cancelUrl } = (req.body || {}) as { tenantSlug?: string; priceId?: string; successUrl?: string; cancelUrl?: string };
    if (!tenantSlug || !priceId || !successUrl || !cancelUrl) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const url = await createCheckoutSessionForTenant({ tenantId: t.id, tenantSlug: t.slug, priceId, successUrl, cancelUrl });
    return res.json({ url });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;


