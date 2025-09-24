import '../config/env';
import { getPrisma } from '../db/client';
import { getRedis } from '../redis/kv';
import { CONFIG } from '../config/env';

function today(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function main() {
  const prisma = getPrisma();
  const redis = getRedis();
  const date = today();
  // naive: scan usage keys for today
  const pattern = `${CONFIG.redisKeyPrefix}usage:*:tenant:messages:${date}`;
  const stream = (redis as any).scanStream({ match: pattern, count: 100 });
  const keys: string[] = await new Promise((resolve, reject) => {
    const out: string[] = [];
    stream.on('data', (arr: string[]) => { out.push(...arr); });
    stream.on('end', () => resolve(out));
    stream.on('error', reject);
  });
  for (const k of keys) {
    const parts = k.split(':');
    // scv2:usage:<tenantId>:tenant:messages:YYYY-MM-DD
    const tenantId = parts[2];
    const v = await redis.get(k);
    const c = v ? Number(v) : 0;
    if (c > 0 && tenantId) {
      await (prisma as any).usageEvent.create({ data: { tenantId, type: 'messages_daily', subjectId: date, count: c, occurredAt: new Date() } });
    }
  }
  // eslint-disable-next-line no-console
  console.log('Usage summary created for', date);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });


