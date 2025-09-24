/*
  Compare two tenants' channels and settings side-by-side.

  Usage:
  sudo ENV_FILE=/etc/chatorical/support-chat-v2.env SLUG_A=a-tenant SLUG_B=b-tenant npx -y ts-node src/scripts/compare_tenants.ts
*/
import '../config/env';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getPrisma } from '../db/client';
import { decryptJsonEnvelope } from '../services/crypto';

function loadEnvFromOptionalFile(): void {
  const p = process.env.ENV_FILE;
  if (p && fs.existsSync(p)) dotenv.config({ path: path.resolve(p) });
}

function mask(v: string | null | undefined, keep = 6): string | null {
  if (!v) return v ?? null;
  if (v.length <= keep) return v;
  return '*'.repeat(Math.max(0, v.length - keep)) + v.slice(-keep);
}

async function loadTenantSummary(slug: string) {
  const prisma = getPrisma();
  const t = await prisma.tenant.findUnique({ where: { slug } });
  if (!t) return null;
  const ch = await (prisma as any).channel.findMany({ where: { tenantId: t.id }, orderBy: { updatedAt: 'desc' } });
  const settings = await (prisma as any).setting.findMany({ where: { tenantId: t.id }, orderBy: { key: 'asc' } });
  const channels = (ch as any[]).map((c) => {
    const cfg = decryptJsonEnvelope(c.encConfig) as { botToken?: string; supportGroupId?: string };
    return {
      id: c.id,
      type: c.type,
      status: c.status,
      supportGroupId: cfg?.supportGroupId || null,
      headerSecret: mask(c.headerSecret || null),
      webhookSecret: mask(c.webhookSecret || null),
      botTokenMasked: mask((cfg?.botToken as string) || null),
      updatedAt: c.updatedAt,
    };
  });
  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;
  return { id: t.id, slug: t.slug, name: t.name, channels, settings: settingsMap };
}

async function main(): Promise<void> {
  loadEnvFromOptionalFile();
  const slugA = String(process.env.SLUG_A || 'a-tenant');
  const slugB = String(process.env.SLUG_B || 'b-tenant');
  const a = await loadTenantSummary(slugA);
  const b = await loadTenantSummary(slugB);
  if (!a || !b) throw new Error('tenant_not_found');
  // Build union of setting keys
  const allKeys = Array.from(new Set([...Object.keys(a.settings), ...Object.keys(b.settings)])).sort();
  const settingsComparison = allKeys.map((k) => ({ key: k, a: a.settings[k] ?? null, b: b.settings[k] ?? null }));
  const result = { ok: true, A: a, B: b, settingsComparison };
  console.log(JSON.stringify(result));
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });


