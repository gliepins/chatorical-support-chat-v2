"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhookRouter = stripeWebhookRouter;
const express_1 = require("express");
const env_1 = require("../config/env");
const client_1 = require("../db/client");
const billing_1 = require("../services/billing");
function stripeWebhookRouter() {
    const router = (0, express_1.Router)();
    // Stripe requires raw body for signature verification
    router.post('/v1/stripe/webhook', expressRawMiddleware(), async (req, res) => {
        const signature = req.header('stripe-signature');
        const secret = env_1.CONFIG.stripeWebhookSecret || '';
        const stripe = (0, billing_1.getStripe)();
        let event;
        try {
            if (!signature || !secret)
                return res.status(400).json({ error: 'missing_signature_or_secret' });
            event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
        }
        catch (err) {
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        try {
            const prisma = (0, client_1.getPrisma)();
            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                case 'customer.subscription.deleted': {
                    const sub = event.data.object;
                    const tenantId = sub?.metadata?.tenantId || sub?.metadata?.tenant_id;
                    if (tenantId) {
                        const status = String(sub.status || 'unknown');
                        await prisma.setting.upsert({ where: { tenantId_key: { tenantId, key: 'stripe.subscriptionStatus' } }, update: { value: status }, create: { tenantId, key: 'stripe.subscriptionStatus', value: status } });
                        const planKey = String(sub?.items?.data?.[0]?.price?.metadata?.key || '');
                        if (planKey)
                            await prisma.setting.upsert({ where: { tenantId_key: { tenantId, key: 'stripe.planKey' } }, update: { value: planKey }, create: { tenantId, key: 'stripe.planKey', value: planKey } });
                    }
                    break;
                }
                case 'checkout.session.completed': {
                    const sess = event.data.object;
                    const tenantId = sess?.metadata?.tenantId || sess?.metadata?.tenant_id;
                    const subId = sess?.subscription;
                    if (tenantId && subId) {
                        await prisma.setting.upsert({ where: { tenantId_key: { tenantId, key: 'stripe.subscriptionId' } }, update: { value: String(subId) }, create: { tenantId, key: 'stripe.subscriptionId', value: String(subId) } });
                    }
                    break;
                }
                default:
                    break;
            }
            return res.json({ received: true });
        }
        catch (e) {
            return res.status(500).json({ error: 'internal_error', detail: e?.message });
        }
    });
    return router;
}
function expressRawMiddleware() {
    return (req, _res, next) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
    };
}
