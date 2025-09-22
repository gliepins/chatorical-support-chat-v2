import express from 'express';

// Mock prisma for tenant + create
(globalThis as any).__prisma = {
  tenant: { findUnique: async ({ where }: any) => ({ id: where.slug || 'default' }) },
  conversation: { create: async () => ({ id: 'c1', tenantId: 'default', codename: 'C-TEST' }) },
  setting: { findUnique: async ({ where }: any) => (where.tenantId_key.key === 'flags.public.disableStart' ? { value: 'true' } : null) },
};

async function main() {
  process.env.CONVERSATION_JWT_SECRET = 'test_jwt_secret_abcdefghijklmnopqrstuvwxyz';
  const app = express();
  app.use(express.json());
  const { default: publicV1 } = await import('../src/api/publicV1');
  app.use((_req, _res, next) => { (require('../src/middleware/tenantContext') as any).tenantContext({ header: ()=> 'default' } as any, {} as any, next); });
  app.use(publicV1);
  const http = await import('http');
  const server = http.createServer(app);
  await new Promise<void>((r)=>server.listen(0, ()=>r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const res: any = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/v1/conversations/start`, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res:any) => {
      const chunks: Buffer[] = []; res.on('data', (c:any)=>chunks.push(c)); res.on('end', ()=> resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }); req.on('error', reject); req.write(JSON.stringify({ name: 'A' })); req.end();
  });
  await new Promise<void>((r)=>server.close(()=>r()));
  if (res.status !== 403) { console.error('expected 403 disabled'); process.exit(1); }
  console.log('OK public start disabled flag');
  process.exit(0);
}

main().catch((e)=>{ console.error(e); process.exit(1); });


