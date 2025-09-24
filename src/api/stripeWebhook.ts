import { Router } from 'express';
import Stripe from 'stripe';
import { CONFIG } from '../config/env';
import { getPrisma } from '../db/client';
import { getStripe } from '../services/billing';

export function stripeWebhookRouter(): Router {
  const router = Router();

  // Stripe requires raw body for signature verification
  router.post('/v1/stripe/webhook', expressRawMiddleware(), async (req, res) => {
    const signature = req.header('stripe-signature') as string | undefined;
    const secret = CONFIG.stripeWebhookSecret || '';
    const stripe = getStripe();
    let event: Stripe.Event;
    try {
      if (!signature || !secret) return res.status(400).json({ error: 'missing_signature_or_secret' });
      event = stripe.webhooks.constructEvent((req as any).rawBody, signature, secret);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
      const prisma = getPrisma();
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          const tenantId = sub?.metadata?.tenantId || sub?.metadata?.tenant_id;
          if (tenantId) {
            const status = String(sub.status || 'unknown');
            await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId, key: 'stripe.subscriptionStatus' } }, update: { value: status }, create: { tenantId, key: 'stripe.subscriptionStatus', value: status } });
            const planKey = String(sub?.items?.data?.[0]?.price?.metadata?.key || '');
            if (planKey) await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId, key: 'stripe.planKey' } }, update: { value: planKey }, create: { tenantId, key: 'stripe.planKey', value: planKey } });
          }
          break;
        }
        case 'checkout.session.completed': {
          const sess = event.data.object as any;
          const tenantId = sess?.metadata?.tenantId || sess?.metadata?.tenant_id;
          const subId = sess?.subscription;
          if (tenantId && subId) {
            await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId, key: 'stripe.subscriptionId' } }, update: { value: String(subId) }, create: { tenantId, key: 'stripe.subscriptionId', value: String(subId) } });
          }
          break;
        }
        default:
          break;
      }
      return res.json({ received: true });
    } catch (e: any) {
      return res.status(500).json({ error: 'internal_error', detail: e?.message });
    }
  });

  return router;
}

function expressRawMiddleware() {
  return (req: any, _res: any, next: any) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => { (req as any).rawBody = Buffer.concat(chunks); next(); });
  };
}


