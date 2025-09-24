"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
  Migrate from 'default' tenant to 'a-tenant'. Copies channel and settings, then quarantines 'default'.

  Usage:
  sudo ENV_FILE=/etc/chatorical/support-chat-v2.env npx -y ts-node src/scripts/migrate_default_to_a_tenant.ts
*/
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("../db/client");
function loadEnvFromOptionalFile() {
    const p = process.env.ENV_FILE;
    if (p && fs_1.default.existsSync(p))
        dotenv_1.default.config({ path: path_1.default.resolve(p) });
}
async function main() {
    loadEnvFromOptionalFile();
    const prisma = (0, client_1.getPrisma)();
    // Ensure a-tenant exists
    let a = await prisma.tenant.findUnique({ where: { slug: 'a-tenant' } });
    if (!a)
        a = await prisma.tenant.create({ data: { slug: 'a-tenant', name: 'Tenant A' } });
    // Find default tenant
    const d = await prisma.tenant.findUnique({ where: { slug: 'default' } });
    if (!d)
        throw new Error('default_tenant_missing');
    // Copy latest telegram channel from default → a-tenant if a-tenant has none
    const aCh = await prisma.channel.findFirst({ where: { tenantId: a.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
    if (!aCh) {
        const dCh = await prisma.channel.findFirst({ where: { tenantId: d.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
        if (dCh) {
            await prisma.channel.create({ data: { tenantId: a.id, type: dCh.type, encConfig: dCh.encConfig, webhookSecret: dCh.webhookSecret + '_A', headerSecret: dCh.headerSecret, status: 'active' } });
        }
    }
    // Copy settings
    const dSettings = await prisma.setting.findMany({ where: { tenantId: d.id } });
    for (const s of dSettings) {
        await prisma.setting.upsert({ where: { tenantId_key: { tenantId: a.id, key: s.key } }, update: { value: s.value }, create: { tenantId: a.id, key: s.key, value: s.value } });
    }
    // Quarantine default
    await prisma.setting.upsert({ where: { tenantId_key: { tenantId: d.id, key: 'flags.public.disableStart' } }, update: { value: 'true' }, create: { tenantId: d.id, key: 'flags.public.disableStart', value: 'true' } });
    // Optionally disable default channel
    await prisma.channel.updateMany({ where: { tenantId: d.id, type: 'telegram' }, data: { status: 'disabled' } });
    console.log(JSON.stringify({ ok: true, migrated: true, a_tenant_id: a.id }));
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
