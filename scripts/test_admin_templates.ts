import express from 'express';

const store: any[] = [];
(globalThis as any).__prisma = {
  tenant: { findUnique: ({ where }: any) => Promise.resolve(where.slug === 't' ? { id: 'tid' } : null) },
  messageTemplateLocale: {
    upsert: ({ where, create }: any) => {
      const idx = store.findIndex((r) => r.tenantId === where.tenantId_key_locale.tenantId && r.key === where.tenantId_key_locale.key && r.locale === where.tenantId_key_locale.locale);
      if (idx >= 0) { store[idx] = { ...store[idx], ...create }; return Promise.resolve(store[idx]); }
      const row = { id: `tpl_${store.length + 1}`, ...create };
      store.push(row); return Promise.resolve(row);
    },
    findMany: ({ where }: any) => Promise.resolve(store.filter((r) => r.tenantId === where.tenantId && (!where.locale || r.locale === where.locale))),
    delete: ({ where }: any) => { const idx = store.findIndex((r) => r.tenantId === where.tenantId_key_locale.tenantId && r.key === where.tenantId_key_locale.key && r.locale === where.tenantId_key_locale.locale); if (idx >= 0) store.splice(idx, 1); return Promise.resolve({}); },
  },
};

async function main() {
  process.env.SERVICE_TOKEN = 'test';
  const { default: adminTemplates } = await import('../src/api/adminTemplates');
  const app = express();
  app.use(express.json());
  app.use(adminTemplates);
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
  const up = await (globalThis as any).fetch(`${base}/v1/admin/templates/upsert`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-auth': 'test' }, body: JSON.stringify({ tenantSlug: 't', key: 'welcome', locale: 'en', text: 'Hello' }) });
  if (up.status !== 200) { console.error('upsert failed'); process.exit(1); }
  // List
  const li = await (globalThis as any).fetch(`${base}/v1/admin/templates/t?locale=en`, { headers: { 'x-internal-auth': 'test' } });
  const data = await li.json();
  if (!data.templates || data.templates.length !== 1) { console.error('list failed'); process.exit(1); }
  // Delete
  const del = await (globalThis as any).fetch(`${base}/v1/admin/templates/t/welcome/en`, { method: 'DELETE', headers: { 'x-internal-auth': 'test' } });
  if (del.status !== 200) { console.error('delete failed'); process.exit(1); }

  await new Promise((r) => server.close(() => r(null)));
  console.log('OK admin templates');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


