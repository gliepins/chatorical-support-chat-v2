import express from 'express';

// Mock prisma
(globalThis as any).__prisma = {
  tenant: { findUnique: ({ where }: any) => Promise.resolve(where.slug === 't' ? { id: 'tid' } : null) },
  auditLog: { findMany: ({ where }: any) => Promise.resolve([{ id: 'a1', tenantId: where.tenantId, conversationId: 'c1', actor: 'system', action: 'test', meta: {}, createdAt: new Date() }]) },
};

async function main() {
  const app = express();
  app.use(express.json());
  // Inject API key into request for scope check
  app.use((req: any, _res, next: any) => { req.apiKey = { id: 'k', tenantId: 'tid', scopes: ['admin:read'] }; next(); });
  const { default: adminAudit } = await import('../src/api/adminAudit');
  app.use(adminAudit);
  const http = await import('http');
  const server = http.createServer(app);
  await new Promise<void>((r)=>server.listen(0, ()=>r()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const res: any = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/v1/admin/audit/t/export`, { method: 'GET' }, (res:any) => {
      const chunks: Buffer[] = []; res.on('data', (c:any)=>chunks.push(c)); res.on('end', ()=> resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }); req.on('error', reject); req.end();
  });
  await new Promise<void>((r)=>server.close(()=>r()));
  const body = JSON.parse(res.body);
  if (!body || !body.entries || body.entries.length !== 1) { console.error('audit export failed'); process.exit(1); }
  console.log('OK admin audit export');
  process.exit(0);
}

main().catch((e)=>{ console.error(e); process.exit(1); });


