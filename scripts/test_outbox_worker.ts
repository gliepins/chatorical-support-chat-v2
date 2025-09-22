import { enqueueOutbox } from '../src/services/outbox';
import { processOnce } from '../src/worker/outboxWorker';

// Mock prisma and fetch
const outbox: any[] = [];
(globalThis as any).__prisma = {
  $transaction: async (ops: any[]) => { await Promise.all(ops); },
  outbox: {
    upsert: ({ where, create }: any) => {
      if (where && where.tenantId_idempotencyKey) {
        const existing = outbox.find((o) => o.tenantId === where.tenantId_idempotencyKey.tenantId && o.idempotencyKey === where.tenantId_idempotencyKey.idempotencyKey);
        if (existing) return Promise.resolve(existing);
      }
      const row = { id: `obx_${outbox.length + 1}`, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), ...create };
      outbox.push(row);
      return Promise.resolve(row);
    },
    findFirst: ({ where }: any) => {
      const row = outbox.find((o) => o.status === 'PENDING' && o.nextAttemptAt <= new Date());
      return Promise.resolve(row || null);
    },
    update: ({ where, data }: any) => {
      const row = outbox.find((o) => o.id === where.id);
      Object.assign(row, typeof data === 'function' ? data(row) : data);
      return Promise.resolve(row);
    },
  },
  channel: {
    findFirst: () => Promise.resolve({ encConfig: JSON.stringify({ v: 1, w: '', i: '', t: '', c: Buffer.from(JSON.stringify({ botToken: 'B' })).toString('base64') }) }),
  },
};
(globalThis as any).fetch = async () => ({ async json() { return { ok: true }; } }) as any;

// Override decrypt passthrough
const cryptoMod = require('../src/services/crypto');
cryptoMod.decryptJsonEnvelope = (s: string) => { const p = JSON.parse(s); return JSON.parse(Buffer.from(p.c, 'base64').toString('utf8')); };

async function main() {
  const item = await enqueueOutbox('t1', 'telegram_send', { chatId: 1, text: 'hello' }, 'idem1');
  if (!item || !item.id) { console.error('enqueue failed'); process.exit(1); }
  const processed = await processOnce();
  if (!processed) { console.error('worker did not process item'); process.exit(1); }
  console.log('OK outbox worker');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


