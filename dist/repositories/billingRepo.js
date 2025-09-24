"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertPlan = upsertPlan;
exports.listPlansWithPricesAndFeatures = listPlansWithPricesAndFeatures;
exports.deactivatePlan = deactivatePlan;
exports.setStripePriceId = setStripePriceId;
const client_1 = require("../db/client");
async function upsertPlan(plan, prices, features) {
    const prisma = (0, client_1.getPrisma)();
    const p = await prisma.plan.upsert({
        where: { key: plan.key },
        update: { name: plan.name, description: plan.description ?? null, isActive: true },
        create: { key: plan.key, name: plan.name, description: plan.description ?? null },
    });
    // Upsert prices (deactivate missing intervals for same currency)
    for (const pr of prices) {
        const existing = await prisma.planPrice.findFirst({ where: { planId: p.id, currency: pr.currency, interval: pr.interval, isActive: true } });
        if (!existing) {
            await prisma.planPrice.create({ data: { planId: p.id, currency: pr.currency, unitAmountCents: pr.unitAmountCents, interval: pr.interval, isActive: pr.isActive ?? true } });
        }
        else if (existing.unitAmountCents !== pr.unitAmountCents) {
            await prisma.planPrice.update({ where: { id: existing.id }, data: { unitAmountCents: pr.unitAmountCents } });
        }
    }
    // Upsert features
    for (const f of features) {
        await prisma.planFeature.upsert({ where: { planId_key: { planId: p.id, key: f.key } }, update: { value: f.value }, create: { planId: p.id, key: f.key, value: f.value } });
    }
    return p;
}
async function listPlansWithPricesAndFeatures() {
    const prisma = (0, client_1.getPrisma)();
    return prisma.plan.findMany({ where: { isActive: true }, include: { prices: { where: { isActive: true } }, features: true }, orderBy: { name: 'asc' } });
}
async function deactivatePlan(key) {
    const prisma = (0, client_1.getPrisma)();
    const p = await prisma.plan.update({ where: { key }, data: { isActive: false } });
    await prisma.planPrice.updateMany({ where: { planId: p.id, isActive: true }, data: { isActive: false } });
    return p;
}
async function setStripePriceId(planKey, interval, currency, priceId) {
    const prisma = (0, client_1.getPrisma)();
    const p = await prisma.plan.findUnique({ where: { key: planKey } });
    if (!p)
        throw new Error('plan_not_found');
    const price = await prisma.planPrice.findFirst({ where: { planId: p.id, interval, currency } });
    if (!price)
        throw new Error('plan_price_not_found');
    await prisma.planPrice.update({ where: { id: price.id }, data: { stripePriceId: priceId } });
}
