import express from 'express';

// Minimal prisma/channel for secret/tenant
(globalThis as any).__prisma = {
  channel: { findUnique: ({ where }: any) => where.webhookSecret === 'whsec' ? { tenantId: 'tid', encConfig: JSON.stringify({ v:1,w:'',i:'',t:'',c: Buffer.from(JSON.stringify({ botToken:'B', headerSecret:'HS' })).toString('base64') }) } : null },
  tenant: { findUnique: () => ({ id: 'tid' }) },
  conversation: { findFirst: () => null, create: () => ({ id: 'c1' }), update: (x:any)=>x },
  message: { create: (x:any)=>x },
};
const cryptoMod = require('../src/services/crypto');
cryptoMod.decryptJsonEnvelope = (s: string) => { const p = JSON.parse(s); return JSON.parse(Buffer.from(p.c, 'base64').toString('utf8')); };

async function main() {
  const { telegramRouter } = await import('../src/channels/telegram/webhook');
  const { getMetricsText } = await import('../src/telemetry/metrics');
  const app = express();
  app.use(express.json());
  app.use(telegramRouter());
  const server = app.listen(0);
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  const update = { update_id: 1, message: { chat: { type:'supergroup' }, text: 'x' } };
  const http = await import('http');
  // Unauthorized header
  await new Promise<void>((resolve, reject) => {
    const req = http.request(`${base}/v1/telegram/webhook/whsec`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'BAD' } }, (res:any) => { res.on('data',()=>{}); res.on('end', ()=> resolve()); });
    req.on('error', reject); req.write(JSON.stringify(update)); req.end();
  });
  // Idempotent skip
  await new Promise<void>((resolve, reject) => {
    const req = http.request(`${base}/v1/telegram/webhook/whsec`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'HS' } }, (res:any) => { res.on('data',()=>{}); res.on('end', ()=> resolve()); });
    req.on('error', reject); req.write(JSON.stringify({ ...update, update_id: 2 })); req.end();
  });
  await new Promise<void>((resolve, reject) => {
    const req = http.request(`${base}/v1/telegram/webhook/whsec`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'HS' } }, (res:any) => { res.on('data',()=>{}); res.on('end', ()=> resolve()); });
    req.on('error', reject); req.write(JSON.stringify({ ...update, update_id: 2 })); req.end();
  });
  const text = getMetricsText();
  await new Promise((r)=>server.close(()=>r(null)));
  if (!/telegram_webhook_unauthorized_total\s+1/.test(text)) { console.error('unauthorized metric missing'); process.exit(1); }
  if (!/telegram_webhook_idempotent_skipped_total\s+1/.test(text)) { console.error('idempotent metric missing'); process.exit(1); }
  console.log('OK webhook metrics');
  process.exit(0);
}

main().catch((e)=>{ console.error(e); process.exit(1); });


