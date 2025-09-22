import { resolveTenantContextAsync } from '../src/middleware/tenantContext';

async function main() {
  const fakeReq: any = { header: () => undefined, apiKey: { tenantId: 'tenant-123' } };
  const tc = await resolveTenantContextAsync(fakeReq);
  if (tc.tenantId !== 'tenant-123') {
    console.error('TenantContext did not derive from API key');
    process.exit(1);
  }
  console.log('OK tenant context API key');
}

main().catch((e) => { console.error(e); process.exit(1); });


