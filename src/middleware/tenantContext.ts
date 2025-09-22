import { Request, Response, NextFunction } from 'express';
import { getPrisma } from '../db/client';

export type TenantContext = { tenantId: string };

const slugToIdCache = new Map<string, string>();

async function getTenantIdBySlug(slug: string): Promise<string> {
  if (slugToIdCache.has(slug)) return slugToIdCache.get(slug)!;
  const prisma = getPrisma();
  const t = await prisma.tenant.findUnique({ where: { slug } });
  if (!t) throw new Error('tenant_not_found');
  slugToIdCache.set(slug, t.id);
  return t.id;
}

export async function resolveTenantContextAsync(req: Request): Promise<TenantContext> {
  // Prefer API key-derived tenant if present
  const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
  if (apiKey && apiKey.tenantId) {
    return { tenantId: apiKey.tenantId };
  }
  const header = req.header('x-tenant-id');
  const slug = (header && header.trim()) || 'default';
  const tenantId = await getTenantIdBySlug(slug);
  return { tenantId };
}

export function tenantContext(req: Request, res: Response, next: NextFunction) {
  resolveTenantContextAsync(req)
    .then((tc) => { (req as any).tenant = tc; next(); })
    .catch(() => res.status(400).json({ error: 'tenant_not_found' }));
}


