import express from 'express';

const store: any[] = [
  { tenantId: 'tid', key: 'welcome', locale: 'en', enabled: true, text: 'Hello {name}' },
  { tenantId: 'tid', key: 'welcome', locale: 'default', enabled: true, text: 'Hi {name}' },
];

(globalThis as any).__prisma = {
  tenant: { findUnique: ({ where }: any) => Promise.resolve(where.slug === 't' ? { id: 'tid' } : null) },
  messageTemplateLocale: {
    findUnique: ({ where }: any) => Promise.resolve(store.find((r) => r.tenantId === where.tenantId_key_locale.tenantId && r.key === where.tenantId_key_locale.key && r.locale === where.tenantId_key_locale.locale) || null),
  },
};

async function main() {
  const { default: adminTemplates, previewTemplatesRouter } = await import('../src/api/adminTemplates');
  // ensure pretty logger doesn't try to load transport
  process.env.LOG_PRETTY = 'false';
  const app = express();
  app.use(previewTemplatesRouter);
  app.use(adminTemplates);
  const server = app.listen(0);
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  (globalThis as any).fetch = async (url: string) => {
    const http = await import('http');
    return new Promise<any>((resolve, reject) => {
      const req = http.request(url, { method: 'GET' }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, async json() { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } }));
      });
      req.on('error', reject);
      req.end();
    });
  };
  const res1 = await (globalThis as any).fetch(`${base}/v1/admin/templates/t/preview/welcome?locale=en&vars=${encodeURIComponent(JSON.stringify({ name: 'Ada' }))}`);
  if (res1.status !== 200) { console.error('preview en failed'); process.exit(1); }
  const _j1 = await res1.json();
  if (!_j1 || typeof _j1.rendered !== 'string') { console.error('preview en no rendered'); process.exit(1); }
  const res2 = await (globalThis as any).fetch(`${base}/v1/admin/templates/t/preview/welcome?locale=fr-FR&vars=${encodeURIComponent(JSON.stringify({ name: 'Ada' }))}`);
  if (res2.status !== 200) { console.error('fallback failed'); process.exit(1); }
  await new Promise((r) => server.close(() => r(null)));
  console.log('OK template preview');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


