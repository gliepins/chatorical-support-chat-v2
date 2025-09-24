import { getRedis } from '../redis/kv';
import { CONFIG } from '../config/env';

const redis = getRedis();

function key(tenantId: string, conversationId: string | null, counter: string, dateStr: string): string {
  const conv = conversationId ? `conv:${conversationId}` : 'tenant';
  return `${CONFIG.redisKeyPrefix}usage:${tenantId}:${conv}:${counter}:${dateStr}`;
}

function today(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export async function incrDailyCounter(tenantId: string, counter: string, conversationId: string | null = null): Promise<number> {
  const k = key(tenantId, conversationId, counter, today());
  const v = await redis.incr(k);
  if (v === 1) {
    // expire after ~2 days to cover timezone skew
    await redis.expire(k, 172800);
  }
  return v;
}

export async function getDailyCounter(tenantId: string, counter: string, conversationId: string | null = null): Promise<number> {
  const k = key(tenantId, conversationId, counter, today());
  const v = await redis.get(k);
  return v ? Number(v) : 0;
}

// Backward-compatible helpers for messages
export async function incrDailyMessages(tenantId: string, conversationId: string | null): Promise<number> {
  return incrDailyCounter(tenantId, 'messages', conversationId);
}

export async function getDailyMessages(tenantId: string, conversationId: string | null): Promise<number> {
  return getDailyCounter(tenantId, 'messages', conversationId);
}



