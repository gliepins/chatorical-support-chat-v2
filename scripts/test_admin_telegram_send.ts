import adminTelegram from '../src/api/adminTelegram';
import express from 'express';

// Mock Prisma and decrypt/fetch
(globalThis as any).__prisma = {
  tenant: { findUnique: ({ where }: any) => Promise.resolve(where.slug === 't' ? { id: 'tid' } : null) },
  channel: { findFirst: ({ where }: any) => Promise.resolve(where.tenantId === 'tid' ? { encConfig: JSON.stringify({ v: 1, w: '', i: '', t: '', c: Buffer.from(JSON.stringify({ botToken: 'B' })).toString('base64') }) } : null) },
};
(globalThis as any).fetch = async () => ({ async json() { return { ok: true }; } }) as any;

// Override decrypt to passthrough our encoded payload
jestMockDecrypt();
function jestMockDecrypt() {
  const mod = require('../src/services/crypto');
  mod.decryptJsonEnvelope = (serialized: string) => {
    try { const p = JSON.parse(serialized); const plaintext = Buffer.from(p.c, 'base64').toString('utf8'); return JSON.parse(plaintext); } catch { return { botToken: 'B' }; }
  };
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => { (require('../src/middleware/serviceAuth') as any).requireServiceAuth = (_r: any, _s: any, n: any) => n(); next(); });
  app.use(adminTelegram);
  const server = app.listen(0);
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  const res = await (globalThis as any).fetch(`${base}/v1/admin/telegram/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantSlug: 't', chatId: 1, text: 'hi' }) });
  const data = await res.json();
  await new Promise((r) => server.close(() => r(null)));
  if (!data || data.ok !== true) { console.error('admin telegram send failed'); process.exit(1); }
  console.log('OK admin telegram send');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


