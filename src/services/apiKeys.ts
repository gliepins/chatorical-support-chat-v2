import crypto from 'crypto';
import { getPrisma } from '../db/client';

export type ApiKeyRecord = {
  id: string;
  tenantId: string;
  name: string;
  hashedKey: string;
  scopes: string; // comma-separated
  createdAt: Date;
  lastUsedAt: Date | null;
};

export function generateApiKeyPlain(): string {
  return `scv2_${crypto.randomBytes(24).toString('base64url')}`;
}

export function hashApiKey(plain: string): string {
  const salt = 'scv2.ak.v1';
  return crypto.createHash('sha256').update(salt + ':' + plain).digest('hex');
}

export async function createApiKey(tenantId: string, name: string, scopes: string[]): Promise<{ plain: string; record: ApiKeyRecord }> {
  const prisma = getPrisma();
  const plain = generateApiKeyPlain();
  const hashed = hashApiKey(plain);
  const record = await (prisma as any).apiKey.create({ data: { tenantId, name, hashedKey: hashed, scopes: scopes.join(',') } });
  return { plain, record } as any;
}

export async function verifyApiKey(plain: string): Promise<ApiKeyRecord | null> {
  const prisma = getPrisma();
  const hashed = hashApiKey(plain);
  const row = await (prisma as any).apiKey.findFirst({ where: { hashedKey: hashed } });
  if (!row) return null;
  try { await (prisma as any).apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }); } catch {}
  return row as any;
}


