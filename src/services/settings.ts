import { getPrisma } from '../db/client';

type CacheEntry = { value: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 30_000;

function keyOf(tenantId: string, key: string): string {
  return `${tenantId}::${key}`;
}

export async function getSetting(tenantId: string, key: string, ttlMs = DEFAULT_TTL_MS): Promise<string | undefined> {
  const ck = keyOf(tenantId, key);
  const now = Date.now();
  const hit = cache.get(ck);
  if (hit && hit.expiresAt > now) return hit.value === null ? undefined : hit.value;
  try {
    const prisma = getPrisma();
    const row = await (prisma as any).setting.findUnique({ where: { tenantId_key: { tenantId, key } } });
    const val: string | null = row ? (row.value as string) : null;
    cache.set(ck, { value: val, expiresAt: now + ttlMs });
    return val === null ? undefined : val;
  } catch {
    return undefined;
  }
}

export function invalidateSetting(tenantId: string, key: string) {
  cache.delete(keyOf(tenantId, key));
}

export async function getCommaListSetting(tenantId: string, key: string): Promise<string[]> {
  const v = await getSetting(tenantId, key);
  if (!v) return [];
  return v.split(',').map(s => s.trim()).filter(Boolean);
}


