import { getPrisma } from '../db/client';

async function main(): Promise<void> {
  const slug = process.env.SLUG || 'b-tenant';
  const name = process.env.NAME || 'Tenant B';
  const prisma = getPrisma();
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    const updated = await prisma.tenant.update({ where: { id: existing.id }, data: { name } });
    console.log(JSON.stringify({ ok: true, id: updated.id, slug: updated.slug, updated: true }));
    return;
  }
  const created = await prisma.tenant.create({ data: { slug, name } });
  console.log(JSON.stringify({ ok: true, id: created.id, slug: created.slug, created: true }));
}

main().catch((e) => { console.error(e?.message||e); process.exit(1); });


