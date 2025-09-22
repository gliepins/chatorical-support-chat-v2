import { PrismaClient } from '@prisma/client';

let prismaSingleton: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  // Allow tests to inject a fake Prisma via global
  const injected = (globalThis as any).__prisma;
  if (injected) return injected as any;
  if (prismaSingleton) return prismaSingleton;
  prismaSingleton = new PrismaClient({ log: ['warn', 'error'] });
  return prismaSingleton;
}


