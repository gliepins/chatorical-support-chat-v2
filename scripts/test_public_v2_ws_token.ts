import express from 'express';

// Mock prisma
(globalThis as any).__prisma = {
  tenant: { findUnique: async ({ where }: any) => ({ id: where.slug || 'default' }) },
  conversation: { findFirst: async ({ where }: any) => ({ id: where.id, tenantId: where.tenantId }) },
};

async function main() {
  process.env.CONVERSATION_JWT_SECRET = 'test_jwt_secret_abcdefghijklmnopqrstuvwxyz';
  process.env.UNBIND_JWT_FROM_IP = 'true';
  const app = express();
  app.use(express.json());
  const { default: publicV2 } = await import('../src/api/publicV2');
  // Inject conversation auth by providing a token tied to the path id
  const { signConversationToken } = await import('../src/services/auth');
  const token = signConversationToken('default', 'c1', 'iphash', 120);
  app.use((_req, _res, next) => { (require('../src/middleware/tenantContext') as any).tenantContext({ header: ()=> 'default' } as any, {} as any, next); });
  app.use((req: any, _res, next: any) => { req.headers.authorization = `Bearer ${token}`; next(); });
  app.use(publicV2);
  const http = await import('http');
  const server = http.createServer(app);
  await new Promise<void>((r)=>server.listen(0, ()=>r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const res: any = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/v2/ws/token`, { method: 'POST' }, (res:any) => {
      const chunks: Buffer[] = []; res.on('data', (c:any)=>chunks.push(c)); res.on('end', ()=> resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }); req.on('error', reject); req.end();
  });
  await new Promise<void>((r)=>server.close(()=>r()));
  const body = JSON.parse(res.body);
  if (!body || !body.token || body.expires_in !== 60) { console.error('ws token issue failed'); process.exit(1); }
  console.log('OK public v2 ws token');
  process.exit(0);
}

main().catch((e)=>{ console.error(e); process.exit(1); });


