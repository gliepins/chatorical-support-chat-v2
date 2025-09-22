import express from 'express';

const settings: Record<string, string> = {};
(globalThis as any).__prisma = {
  tenant: { findUnique: ({ where }: any) => Promise.resolve(where.slug === 't' ? { id: 'tid' } : null) },
  setting: {
    findMany: ({ where }: any) => Promise.resolve(Object.entries(settings).map(([k,v]) => ({ tenantId: where.tenantId, key: k, value: v }))),
    upsert: ({ where, update, create }: any) => { const k = where.tenantId_key.key; settings[k] = (update?.value ?? create.value); return Promise.resolve({}); },
  },
};

async function main() {
  process.env.SERVICE_TOKEN = 'test';
  const { default: adminSettings } = await import('../src/api/adminSettings');
  const app = express();
  app.use(express.json());
  app.use(adminSettings);
  const server = app.listen(0);
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
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

  // Upsert
  const up = await (globalThis as any).fetch(`${base}/v1/admin/settings/upsert`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-auth': 'test' }, body: JSON.stringify({ tenantSlug: 't', key: 'allowedOrigins', value: 'https://example.com' }) });
  if (up.status !== 200) { console.error('upsert failed'); process.exit(1); }
  const li = await (globalThis as any).fetch(`${base}/v1/admin/settings/t`, { headers: { 'x-internal-auth': 'test' } });
  const data = await li.json();
  if (!data.settings || data.settings.allowedOrigins !== 'https://example.com') { console.error('list failed'); process.exit(1); }

  await new Promise((r) => server.close(() => r(null)));
  console.log('OK admin settings');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


