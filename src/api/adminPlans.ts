import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { upsertPlan, listPlansWithPricesAndFeatures, deactivatePlan } from '../repositories/billingRepo';
import { ensureStripeCatalog, PlanSpec } from '../services/billing';

const router = Router();

// GET /v1/admin/plans
router.get('/v1/admin/plans', requireServiceOrApiKey(['admin:read']), async (_req, res) => {
  try {
    const plans = await listPlansWithPricesAndFeatures();
    return res.json({ plans });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// POST /v1/admin/plans/upsert { key, name, description?, prices[], features[] }
router.post('/v1/admin/plans/upsert', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const body = (req.body || {}) as any;
    if (!body.key || !body.name) return res.status(400).json({ error: { code: 'missing_params' } });
    const p = await upsertPlan({ key: body.key, name: body.name, description: body.description }, Array.isArray(body.prices) ? body.prices : [], Array.isArray(body.features) ? body.features : []);
    return res.json({ ok: true, planId: p.id });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// DELETE /v1/admin/plans/:key
router.delete('/v1/admin/plans/:key', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    await deactivatePlan(req.params.key);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// POST /v1/admin/plans/sync-stripe — DB → Stripe products/prices (EUR)
router.post('/v1/admin/plans/sync-stripe', requireServiceOrApiKey(['admin:write']), async (_req, res) => {
  try {
    const plans = await listPlansWithPricesAndFeatures();
    const specs: PlanSpec[] = [];
    for (const p of plans) {
      for (const pr of p.prices) {
        specs.push({
          productKey: p.key,
          productName: p.name,
          priceKey: `${p.key}_${pr.interval}`,
          unitAmountUsd: pr.unitAmountCents / 100,
          interval: pr.interval,
          currency: pr.currency,
        });
      }
    }
    const synced = await ensureStripeCatalog(specs);
    return res.json({ ok: true, synced });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;


