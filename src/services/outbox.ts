import { getPrisma } from '../db/client';

export type OutboxItem = {
  id: string;
  tenantId: string;
  type: string;
  payload: any;
  idempotencyKey?: string | null;
};

export async function enqueueOutbox(tenantId: string, type: string, payload: any, idempotencyKey?: string): Promise<OutboxItem> {
  const prisma = getPrisma();
  const row = await (prisma as any).outbox.upsert({
    where: idempotencyKey ? { tenantId_idempotencyKey: { tenantId, idempotencyKey } } as any : { id: '___never___' },
    update: {},
    create: { tenantId, type, payload, idempotencyKey: idempotencyKey || null },
  });
  return row as any;
}

export async function claimNextOutbox(now: Date = new Date()) {
  const prisma = getPrisma();
  const row = await (prisma as any).outbox.findFirst({ where: { status: 'PENDING', nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' } });
  if (!row) return null;
  try {
    await (prisma as any).$transaction([
      (prisma as any).outbox.update({ where: { id: row.id }, data: { status: 'PROCESSING' } }),
    ]);
    return row as any;
  } catch {
    return null;
  }
}

export async function markDone(id: string) {
  const prisma = getPrisma();
  await (prisma as any).outbox.update({ where: { id }, data: { status: 'DONE' } });
}

export async function markFailed(id: string, error: string, backoffSeconds: number) {
  const prisma = getPrisma();
  await (prisma as any).outbox.update({ where: { id }, data: { status: 'PENDING', attempts: { increment: 1 }, lastError: error, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000) } });
}


