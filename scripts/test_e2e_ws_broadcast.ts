import express from 'express';

// Ensure Redis pub/sub is disabled to use local broadcast
process.env.FEATURE_REDIS_PUBSUB = 'false';
process.env.LOG_PRETTY = 'false';

const conversations: any[] = [];
const messages: any[] = [];

(globalThis as any).__prisma = {
  channel: {
    findUnique: ({ where }: any) => {
      if (where.webhookSecret === 'whsec') {
        const enc = JSON.stringify({ v: 1, w: '', i: '', t: '', c: Buffer.from(JSON.stringify({ botToken: 'B' })).toString('base64') });
        return Promise.resolve({ tenantId: 'tid', encConfig: enc });
      }
      return Promise.resolve(null);
    },
  },
  tenant: { findUnique: () => Promise.resolve({ id: 'tid' }) },
  conversation: {
    findFirst: ({ where }: any) => Promise.resolve(conversations.find((c) => c.tenantId === where.tenantId && c.threadId === where.threadId) || null),
    create: ({ data }: any) => { const row = { id: 'c1', ...data, tenantId: data.tenant.connect.id }; conversations.push(row); return Promise.resolve(row); },
    update: ({ where, data }: any) => { const c = conversations.find((x) => x.id === where.id); Object.assign(c, data); return Promise.resolve(c); },
  },
  message: {
    create: ({ data }: any) => { const row = { id: `m${messages.length+1}`, ...data }; messages.push(row); return Promise.resolve(row); },
  },
};

// Decrypt passthrough
const cryptoMod = require('../src/services/crypto');
cryptoMod.decryptJsonEnvelope = (serialized: string) => { const p = JSON.parse(serialized); return JSON.parse(Buffer.from(p.c, 'base64').toString('utf8')); };

async function main() {
  const { telegramRouter } = await import('../src/channels/telegram/webhook');
  const { addClientToConversation, removeClientFromConversation } = await import('../src/ws/hub');
  const app = express();
  app.use(express.json());
  app.use(telegramRouter());
  const server = app.listen(0);
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const received: any[] = [];
  const dummy: any = { send: (data: string) => { try { received.push(JSON.parse(data)); } catch { received.push(data); } } };
  // Add dummy client to future conversation id 'c1'
  addClientToConversation('c1', dummy);

  (globalThis as any).fetch = async (url: string, opts?: any) => {
    const http = await import('http');
    return new Promise<any>((resolve, reject) => {
      const req = http.request(url, { method: (opts && opts.method) || 'GET', headers: (opts && opts.headers) || {} }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, async json() { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } }));
      });
      req.on('error', reject);
      if (opts && opts.body) req.write(opts.body);
      req.end();
    });
  };

  const update = {
    update_id: 999,
    message: {
      message_id: 1,
      message_thread_id: 777,
      chat: { id: -100, type: 'supergroup', title: 'Support' },
      text: 'Hello from TG',
    },
  };
  const res = await (globalThis as any).fetch(`${base}/v1/telegram/webhook/whsec`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
  if (res.status !== 200) { console.error('webhook status not 200'); process.exit(1); }

  // Validate broadcast
  removeClientFromConversation('c1', dummy);
  await new Promise((r) => server.close(() => r(null)));
  if (received.length < 1) { console.error('no ws broadcast received'); process.exit(1); }
  const payload = received[0];
  if (!payload || payload.direction !== 'OUTBOUND' || payload.text !== 'Hello from TG') {
    console.error('ws payload mismatch');
    process.exit(1);
  }
  console.log('OK e2e ws broadcast');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


