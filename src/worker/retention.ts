import { getPrisma } from '../db/client';
import { logger } from '../telemetry/logger';
import { getSetting } from '../services/settings';

export async function runOnce(): Promise<{ tenantsProcessed: number; conversationsDeleted: number }> {
  const prisma = getPrisma();
  let tenantsProcessed = 0;
  let conversationsDeleted = 0;
  const tenants = await (prisma as any).tenant.findMany({ select: { id: true } });
  for (const t of tenants) {
    tenantsProcessed += 1;
    let days = 90;
    try {
      const conf = await getSetting(t.id, 'retention.closed.days');
      if (conf) {
        const n = Number(conf);
        if (Number.isFinite(n) && n > 0) days = n;
      }
    } catch {}
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const result = await (prisma as any).conversation.deleteMany({ where: { tenantId: t.id, status: 'CLOSED', updatedAt: { lt: cutoff } } });
      conversationsDeleted += Number(result?.count || 0);
    } catch (e) {
      try { logger.warn({ event: 'retention_delete_error', tenantId: t.id, err: e }); } catch {}
    }
  }
  try { logger.info({ event: 'retention_complete', tenantsProcessed, conversationsDeleted }); } catch {}
  return { tenantsProcessed, conversationsDeleted };
}

if (require.main === module) {
  runOnce().then((r) => { console.log(JSON.stringify(r)); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
}


