import { getPrisma } from '../db/client';

export type PlanFeatures = Record<string, string>;

export async function getTenantPlanKey(tenantId: string): Promise<string | null> {
  const prisma = getPrisma();
  try {
    const row = await (prisma as any).setting.findUnique({ where: { tenantId_key: { tenantId, key: 'stripe.planKey' } } });
    if (row && typeof row.value === 'string' && row.value.trim().length > 0) return row.value as string;
  } catch {}
  return null;
}

export async function getPlanFeatures(planKey: string): Promise<PlanFeatures> {
  const prisma = getPrisma();
  const p = await (prisma as any).plan.findUnique({ where: { key: planKey }, include: { features: true } });
  const out: PlanFeatures = {};
  if (p && Array.isArray(p.features)) {
    for (const f of p.features) {
      out[f.key as string] = String(f.value ?? '');
    }
  }
  return out;
}

export function featureBoolean(features: PlanFeatures, key: string, defaultValue = false): boolean {
  const v = features[key];
  if (typeof v !== 'string') return defaultValue;
  const t = v.trim().toLowerCase();
  if (['true','1','yes','on'].includes(t)) return true;
  if (['false','0','no','off'].includes(t)) return false;
  return defaultValue;
}

export function featureNumberOrUnlimited(features: PlanFeatures, key: string): number | 'unlimited' | null {
  const v = features[key];
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = v.trim().toLowerCase();
  if (t === 'unlimited') return 'unlimited';
  const n = Number(t);
  if (Number.isFinite(n) && n >= 0) return n;
  return null;
}


