import express from 'express';

const rows = [
  { tenantId: 'tid', key: 'hello', locale: 'default', text: 'Hi' },
  { tenantId: 'tid', key: 'hello', locale: 'en', text: 'Hello' },
];

(globalThis as any).__prisma = {
  tenant: { findUnique: ({ where }: any) => Promise.resolve(where.slug === 't' ? { id: 'tid' } : null) },
  messageTemplateLocale: { findMany: ({ where }: any) => Promise.resolve(rows.filter(r => r.tenantId === where.tenantId && where.locale.in.includes(r.locale))) },
};

async function main() {
  const { default: adminI18n, publicI18nRouter } = await import('../src/api/adminI18n');
  const app = express();
  app.use(publicI18nRouter);
  app.use(adminI18n);
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
  const res = await (globalThis as any).fetch(`${base}/v1/i18n/t/en-US`);
  const data = await res.json();
  if (!data.entries || data.entries.hello !== 'Hello') { console.error('i18n fallback failed'); process.exit(1); }
  await new Promise((r) => server.close(() => r(null)));
  console.log('OK i18n public');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


