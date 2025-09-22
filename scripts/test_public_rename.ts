import express from 'express';

// Mock prisma
const convs: any[] = [{ id: 'c1', tenantId: 'default', customerName: '', codename: 'C-TEST' }];
(globalThis as any).__prisma = {
  conversation: {
    findFirst: async ({ where }: any) => convs.find((c) => c.id === where.id && c.tenantId === where.tenantId) || null,
    create: async ({ data }: any) => { const row = { id: 'c1', tenantId: data.tenant.connect.id, codename: data.codename, customerName: data.customerName || '' }; convs[0] = row; return row; },
    update: async ({ where, data }: any) => { const c = convs.find((x)=>x.id===where.id); if (!c) throw new Error('not found'); c.customerName = data.customerName; return c; },
  },
  message: { findMany: async () => [] },
  tenant: { findUnique: async ({ where }: any) => ({ id: where.slug === 'default' ? 'default' : where.slug }) },
};

async function main() {
  process.env.CONVERSATION_JWT_SECRET = 'test_jwt_secret_abcdefghijklmnopqrstuvwxyz';
  process.env.UNBIND_JWT_FROM_IP = 'true';
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

  // Start conversation to get token
  const startRes: any = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/v1/conversations/start`, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res:any) => {
      const chunks: Buffer[] = []; res.on('data', (c:any)=>chunks.push(c)); res.on('end', ()=> resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }); req.on('error', reject); req.write(JSON.stringify({ name: 'A' })); req.end();
  });
  const start = JSON.parse(startRes.body);

  // Rename with token
  const renameRes: any = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/v1/conversations/${start.conversation_id}/name`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${start.token}` } }, (res:any) => {
      const chunks: Buffer[] = []; res.on('data', (c:any)=>chunks.push(c)); res.on('end', ()=> resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }); req.on('error', reject); req.write(JSON.stringify({ name: 'New Name' })); req.end();
  });
  const rename = JSON.parse(renameRes.body);
  await new Promise<void>((r)=>server.close(()=>r()));
  if (!rename.ok) { console.error('rename failed'); process.exit(1); }
  console.log('OK public rename');
  process.exit(0);
}

main().catch((e)=>{ console.error(e); process.exit(1); });


