import express from 'express';
import publicV1 from '../src/api/publicV1';

// Inject fake prisma with two tenants' messages
(globalThis as any).__prisma = {
  message: {
    findMany: ({ where }: any) => Promise.resolve(where.tenantId === 't1' && where.conversationId === 'c1' ? [{ createdAt: new Date(), direction: 'OUTBOUND', text: 'hi' }] : []),
  },
  conversation: {
    findFirst: ({ where }: any) => Promise.resolve(where.tenantId === 't1' && where.id === 'c1' ? { id: 'c1' } : null),
  },
};

async function main() {
  // Stub Redis to avoid hanging connections
  (globalThis as any).__redis = { set: async () => 'OK', expire: async () => 1, psubscribe: async () => 1, on: () => {}, publish: async () => 1 };
  const app = express();
  app.use((req: any, _res, next) => { (req as any).tenant = { tenantId: 't1' }; next(); });
  app.use(publicV1);
  const server = app.listen(0);
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  (globalThis as any).fetch = async (url: string) => {
    const http = await import('http');
    return new Promise<any>((resolve, reject) => {
      const req = http.request(url, { method: 'GET' }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, async json() { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } });
        });
      });
      req.on('error', reject);
      req.end();
    });
  };
  const okRes = await (globalThis as any).fetch(`${base}/v1/conversations/c1/messages`);
  if (okRes.status !== 200) { console.error('expected 200 for same tenant'); process.exit(1); }
  const notFoundRes = await (globalThis as any).fetch(`${base}/v1/conversations/c2/messages`);
  await new Promise((r) => server.close(() => r(null)));
  if (notFoundRes.status !== 404) { console.error('expected 404 for cross tenant missing conv'); process.exit(1); }
  console.log('OK public v1 cross-tenant');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


