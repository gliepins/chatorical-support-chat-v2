import * as repo from '../src/repositories/conversationRepo';

// Inject a fake prisma to verify tenant scoping
const created: any[] = [];
(globalThis as any).__prisma = {
  conversation: {
    create: ({ data }: any) => { created.push(data); return Promise.resolve({ id: 'c1', tenantId: data.tenant?.connect?.id }); },
    findFirst: ({ where }: any) => { return Promise.resolve(where && where.tenantId === 't1' ? { id: 'c1', tenantId: 't1' } : null); },
    update: ({ where, data }: any) => Promise.resolve({ id: where.id, ...data }),
  },
  message: {
    findMany: ({ where }: any) => Promise.resolve(where.tenantId === 't1' ? [{ createdAt: new Date(), direction: 'OUTBOUND', text: 'hi' }] : []),
    create: ({ data }: any) => Promise.resolve({ id: 'm1', ...data }),
  },
};

async function main() {
  await repo.createConversation('t1', 'Alice', 'en');
  if (!created.length || created[0].tenant?.connect?.id !== 't1') {
    console.error('createConversation did not enforce tenantId connect');
    process.exit(1);
  }
  const msgs = await repo.listMessages('t1', 'c1');
  if (!Array.isArray(msgs) || msgs.length !== 1) {
    console.error('listMessages did not scope by tenantId');
    process.exit(1);
  }
  const found = await repo.findConversationByThreadId('t1', 123);
  if (found && (found as any).tenantId !== 't1') {
    console.error('findConversationByThreadId returned cross-tenant data');
    process.exit(1);
  }
  console.log('OK repo tenant enforcement');
}

main().catch((e) => { console.error(e); process.exit(1); });


