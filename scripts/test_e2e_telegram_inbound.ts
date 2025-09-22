import express from 'express';

const conversations: any[] = [];
const messages: any[] = [];

(globalThis as any).__prisma = {
  channel: {
    findUnique: ({ where }: any) => {
      if (where.webhookSecret === 'whsec') {
        // encConfig payload that our decrypt stub will parse
        const enc = JSON.stringify({ v: 1, w: '', i: '', t: '', c: Buffer.from(JSON.stringify({ botToken: 'B' })).toString('base64') });
        return Promise.resolve({ tenantId: 'tid', encConfig: enc });
      }
      return Promise.resolve(null);
    },
  },
  tenant: { findUnique: () => Promise.resolve({ id: 'tid' }) },
  conversation: {
    findFirst: ({ where }: any) => Promise.resolve(conversations.find((c) => c.tenantId === where.tenantId && c.threadId === where.threadId) || null),
    create: ({ data }: any) => { const row = { id: `c${conversations.length+1}`, ...data, tenantId: data.tenant.connect.id }; conversations.push(row); return Promise.resolve(row); },
    update: ({ where, data }: any) => { const c = conversations.find((x) => x.id === where.id); Object.assign(c, data); return Promise.resolve(c); },
  },
  message: {
    create: ({ data }: any) => { const row = { id: `m${messages.length+1}`, ...data }; messages.push(row); return Promise.resolve(row); },
  },
};

// Override decrypt to passthrough our encoded payload
const cryptoMod = require('../src/services/crypto');
cryptoMod.decryptJsonEnvelope = (serialized: string) => { const p = JSON.parse(serialized); return JSON.parse(Buffer.from(p.c, 'base64').toString('utf8')); };

async function main() {
  const { telegramRouter } = await import('../src/channels/telegram/webhook');
  const app = express();
  app.use(express.json());
  app.use(telegramRouter());
  const server = app.listen(0);
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  // Minimal fetch for POST
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
  // Simulate Telegram update for supergroup with text and thread id
  const update = {
    update_id: 123,
    message: {
      message_id: 1,
      message_thread_id: 777,
      chat: { id: -100, type: 'supergroup', title: 'Support' },
      text: 'Hello from TG',
    },
  };
  const res = await (globalThis as any).fetch(`${base}/v1/telegram/webhook/whsec`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
  if (res.status !== 200) { console.error('webhook status not 200'); process.exit(1); }
  if (conversations.length === 0 || messages.length === 0) { console.error('persistence did not occur'); process.exit(1); }
  await new Promise((r) => server.close(() => r(null)));
  console.log('OK e2e telegram inbound');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


