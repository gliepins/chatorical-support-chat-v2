import Stripe from 'stripe';
import { CONFIG } from '../config/env';
import { getPrisma } from '../db/client';

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  if (!CONFIG.stripeSecretKey) throw new Error('STRIPE_SECRET_KEY not configured');
  stripeSingleton = new Stripe(CONFIG.stripeSecretKey, { apiVersion: '2024-06-20' } as any);
  return stripeSingleton;
}

export type PlanSpec = {
  productKey: string; // e.g., 'starter', 'growth', 'pro'
  productName: string;
  priceKey: string;   // e.g., 'starter_monthly'
  unitAmountUsd: number; // in dollars
  interval: 'month' | 'year';
  currency?: string; // default usd
  metadata?: Record<string, string>;
};

export async function ensureStripeCatalog(specs: PlanSpec[]): Promise<{ products: Record<string, string>; prices: Record<string, string> }> {
  const stripe = getStripe();
  const products: Record<string, string> = {};
  const prices: Record<string, string> = {};

  for (const s of specs) {
    // Find or create product by metadata.key
    const list = await stripe.products.list({ limit: 100, active: true });
    let product = list.data.find(p => p.metadata && p.metadata.key === s.productKey);
    if (!product) {
      product = await stripe.products.create({ name: s.productName, metadata: { key: s.productKey, ...(s.metadata || {}) } });
    } else {
      // Keep product name in sync
      if (product.name !== s.productName) {
        await stripe.products.update(product.id, { name: s.productName });
      }
    }
    products[s.productKey] = product.id;

    // Find or create price by metadata.key, archive mismatched amounts
    const priceList = await stripe.prices.list({ product: product.id, limit: 100, active: true });
    const desiredUnitAmount = Math.round(s.unitAmountUsd * 100);
    let price = priceList.data.find(pr => (pr.recurring?.interval === s.interval) && pr.currency === (s.currency || 'usd') && pr.metadata?.key === s.priceKey && pr.unit_amount === desiredUnitAmount);
    if (!price) {
      // Archive any existing price with same key but different amount/interval
      const conflict = priceList.data.find(pr => pr.metadata?.key === s.priceKey);
      if (conflict && conflict.active) { await stripe.prices.update(conflict.id, { active: false }); }
      price = await stripe.prices.create({ product: product.id, unit_amount: desiredUnitAmount, currency: s.currency || 'usd', recurring: { interval: s.interval }, metadata: { key: s.priceKey } });
    }
    prices[s.priceKey] = price.id;
  }

  return { products, prices };
}

export async function ensureStripeCustomerForTenant(tenantId: string, tenantSlug: string): Promise<string> {
  const prisma = getPrisma();
  const key = 'stripe.customerId';
  const existing = await (prisma as any).setting.findUnique({ where: { tenantId_key: { tenantId, key } } });
  if (existing && existing.value) return existing.value as string;
  const stripe = getStripe();
  const customer = await stripe.customers.create({ name: tenantSlug, metadata: { tenantId, tenantSlug } });
  await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId, key } }, update: { value: customer.id }, create: { tenantId, key, value: customer.id } });
  return customer.id;
}

export async function createCheckoutSessionForTenant(opts: { tenantId: string; tenantSlug: string; priceId: string; successUrl: string; cancelUrl: string; }): Promise<string> {
  const stripe = getStripe();
  const customerId = await ensureStripeCustomerForTenant(opts.tenantId, opts.tenantSlug);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { tenantId: opts.tenantId, tenantSlug: opts.tenantSlug },
  });
  return session.url as string;
}


