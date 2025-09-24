import '../config/env';
import { upsertPlan } from '../repositories/billingRepo';

async function main() {
  const plans = [
    {
      key: 'starter',
      name: 'Starter',
      desc: 'Getting started plan',
      prices: [ { currency: 'eur', unitAmountCents: 1900, interval: 'month' as const } ],
      features: [
        { key: 'limits.active_conversations', value: '100' },
        { key: 'limits.messages_per_day', value: '1000' },
        { key: 'channels.telegram', value: 'true' },
      ],
    },
    {
      key: 'growth',
      name: 'Growth',
      desc: 'Growing teams',
      prices: [ { currency: 'eur', unitAmountCents: 4900, interval: 'month' as const } ],
      features: [
        { key: 'limits.active_conversations', value: '1000' },
        { key: 'limits.messages_per_day', value: '10000' },
        { key: 'channels.telegram', value: 'true' },
        { key: 'channels.email', value: 'true' },
      ],
    },
    {
      key: 'pro',
      name: 'Pro',
      desc: 'Advanced features',
      prices: [ { currency: 'eur', unitAmountCents: 9900, interval: 'month' as const } ],
      features: [
        { key: 'limits.active_conversations', value: 'unlimited' },
        { key: 'limits.messages_per_day', value: 'unlimited' },
        { key: 'channels.telegram', value: 'true' },
        { key: 'channels.email', value: 'true' },
        { key: 'channels.slack', value: 'true' },
      ],
    },
  ];

  for (const p of plans) {
    await upsertPlan({ key: p.key, name: p.name, description: p.desc }, p.prices, p.features);
    // eslint-disable-next-line no-console
    console.log('Seeded plan', p.key);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });


