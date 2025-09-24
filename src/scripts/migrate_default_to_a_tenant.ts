/*
  Migrate from 'default' tenant to 'a-tenant'. Copies channel and settings, then quarantines 'default'.

  Usage:
  sudo ENV_FILE=/etc/chatorical/support-chat-v2.env npx -y ts-node src/scripts/migrate_default_to_a_tenant.ts
*/
import '../config/env';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getPrisma } from '../db/client';

function loadEnvFromOptionalFile(): void {
  const p = process.env.ENV_FILE;
  if (p && fs.existsSync(p)) dotenv.config({ path: path.resolve(p) });
}

async function main(): Promise<void> {
  loadEnvFromOptionalFile();
  const prisma = getPrisma();
  // Ensure a-tenant exists
  let a = await prisma.tenant.findUnique({ where: { slug: 'a-tenant' } });
  if (!a) a = await prisma.tenant.create({ data: { slug: 'a-tenant', name: 'Tenant A' } });
  // Find default tenant
  const d = await prisma.tenant.findUnique({ where: { slug: 'default' } });
  if (!d) throw new Error('default_tenant_missing');

  // Copy latest telegram channel from default → a-tenant if a-tenant has none
  const aCh = await (prisma as any).channel.findFirst({ where: { tenantId: a.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
  if (!aCh) {
    const dCh = await (prisma as any).channel.findFirst({ where: { tenantId: d.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
    if (dCh) {
      await (prisma as any).channel.create({ data: { tenantId: a.id, type: dCh.type, encConfig: dCh.encConfig, webhookSecret: dCh.webhookSecret + '_A', headerSecret: dCh.headerSecret, status: 'active' } });
    }
  }

  // Copy settings
  const dSettings = await (prisma as any).setting.findMany({ where: { tenantId: d.id } });
  for (const s of dSettings) {
    await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId: a.id, key: s.key } }, update: { value: s.value }, create: { tenantId: a.id, key: s.key, value: s.value } });
  }

  // Quarantine default
  await (prisma as any).setting.upsert({ where: { tenantId_key: { tenantId: d.id, key: 'flags.public.disableStart' } }, update: { value: 'true' }, create: { tenantId: d.id, key: 'flags.public.disableStart', value: 'true' } });
  // Optionally disable default channel
  await (prisma as any).channel.updateMany({ where: { tenantId: d.id, type: 'telegram' }, data: { status: 'disabled' } });

  console.log(JSON.stringify({ ok: true, migrated: true, a_tenant_id: a.id }));
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });


