import Redis from 'ioredis';
import { CONFIG } from '../config/env';

let singleton: Redis | null = null;

export function getRedis(): Redis {
  const injected = (globalThis as any).__redis;
  if (injected) return injected as Redis;
  if (singleton) return singleton;
  singleton = new Redis(CONFIG.redisUrl);
  return singleton;
}


