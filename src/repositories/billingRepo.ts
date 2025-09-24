import { getPrisma } from '../db/client';

export type PlanInput = { key: string; name: string; description?: string };
export type PriceInput = { currency: string; unitAmountCents: number; interval: 'month'|'year'; isActive?: boolean };
export type FeatureInput = { key: string; value: string };

export async function upsertPlan(plan: PlanInput, prices: PriceInput[], features: FeatureInput[]) {
  const prisma = getPrisma();
  const p = await (prisma as any).plan.upsert({
    where: { key: plan.key },
    update: { name: plan.name, description: plan.description ?? null, isActive: true },
    create: { key: plan.key, name: plan.name, description: plan.description ?? null },
  });
  // Upsert prices (deactivate missing intervals for same currency)
  for (const pr of prices) {
    const existing = await (prisma as any).planPrice.findFirst({ where: { planId: p.id, currency: pr.currency, interval: pr.interval, isActive: true } });
    if (!existing) {
      await (prisma as any).planPrice.create({ data: { planId: p.id, currency: pr.currency, unitAmountCents: pr.unitAmountCents, interval: pr.interval, isActive: pr.isActive ?? true } });
    } else if (existing.unitAmountCents !== pr.unitAmountCents) {
      await (prisma as any).planPrice.update({ where: { id: existing.id }, data: { unitAmountCents: pr.unitAmountCents } });
    }
  }
  // Upsert features
  for (const f of features) {
    await (prisma as any).planFeature.upsert({ where: { planId_key: { planId: p.id, key: f.key } }, update: { value: f.value }, create: { planId: p.id, key: f.key, value: f.value } });
  }
  return p;
}

export async function listPlansWithPricesAndFeatures() {
  const prisma = getPrisma();
  return (prisma as any).plan.findMany({ where: { isActive: true }, include: { prices: { where: { isActive: true } }, features: true }, orderBy: { name: 'asc' } });
}

export async function deactivatePlan(key: string) {
  const prisma = getPrisma();
  const p = await (prisma as any).plan.update({ where: { key }, data: { isActive: false } });
  await (prisma as any).planPrice.updateMany({ where: { planId: p.id, isActive: true }, data: { isActive: false } });
  return p;
}

export async function setStripePriceId(planKey: string, interval: 'month'|'year', currency: string, priceId: string) {
  const prisma = getPrisma();
  const p = await (prisma as any).plan.findUnique({ where: { key: planKey } });
  if (!p) throw new Error('plan_not_found');
  const price = await (prisma as any).planPrice.findFirst({ where: { planId: p.id, interval, currency } });
  if (!price) throw new Error('plan_price_not_found');
  await (prisma as any).planPrice.update({ where: { id: price.id }, data: { stripePriceId: priceId } });
}


