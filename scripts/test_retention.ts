// Minimal in-memory prisma mock
(globalThis as any).__prisma = {
  tenant: { findMany: async () => [{ id: 't1' }] },
  conversation: {
    deleteMany: async ({ where }: any) => {
      if (where.tenantId !== 't1') throw new Error('wrong tenant');
      if (where.status !== 'CLOSED') return { count: 0 };
      return { count: 3 };
    },
  },
  setting: { findUnique: async () => ({ value: '90' }) },
};

async function main() {
  const { runOnce } = await import('../src/worker/retention');
  const res = await runOnce();
  if (res.tenantsProcessed !== 1 || res.conversationsDeleted !== 3) {
    console.error('retention failed');
    process.exit(1);
  }
  console.log('OK retention');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


