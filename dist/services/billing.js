"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripe = getStripe;
exports.ensureStripeCatalog = ensureStripeCatalog;
exports.ensureStripeCustomerForTenant = ensureStripeCustomerForTenant;
exports.createCheckoutSessionForTenant = createCheckoutSessionForTenant;
const stripe_1 = __importDefault(require("stripe"));
const env_1 = require("../config/env");
const client_1 = require("../db/client");
let stripeSingleton = null;
function getStripe() {
    if (stripeSingleton)
        return stripeSingleton;
    if (!env_1.CONFIG.stripeSecretKey)
        throw new Error('STRIPE_SECRET_KEY not configured');
    stripeSingleton = new stripe_1.default(env_1.CONFIG.stripeSecretKey, { apiVersion: '2024-06-20' });
    return stripeSingleton;
}
async function ensureStripeCatalog(specs) {
    const stripe = getStripe();
    const products = {};
    const prices = {};
    for (const s of specs) {
        // Find or create product by metadata.key
        const list = await stripe.products.list({ limit: 100, active: true });
        let product = list.data.find(p => p.metadata && p.metadata.key === s.productKey);
        if (!product) {
            product = await stripe.products.create({ name: s.productName, metadata: { key: s.productKey, ...(s.metadata || {}) } });
        }
        else {
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
            if (conflict && conflict.active) {
                await stripe.prices.update(conflict.id, { active: false });
            }
            price = await stripe.prices.create({ product: product.id, unit_amount: desiredUnitAmount, currency: s.currency || 'usd', recurring: { interval: s.interval }, metadata: { key: s.priceKey } });
        }
        prices[s.priceKey] = price.id;
    }
    return { products, prices };
}
async function ensureStripeCustomerForTenant(tenantId, tenantSlug) {
    const prisma = (0, client_1.getPrisma)();
    const key = 'stripe.customerId';
    const existing = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key } } });
    if (existing && existing.value)
        return existing.value;
    const stripe = getStripe();
    const customer = await stripe.customers.create({ name: tenantSlug, metadata: { tenantId, tenantSlug } });
    await prisma.setting.upsert({ where: { tenantId_key: { tenantId, key } }, update: { value: customer.id }, create: { tenantId, key, value: customer.id } });
    return customer.id;
}
async function createCheckoutSessionForTenant(opts) {
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
    return session.url;
}
