"use strict";
/*
  Enroll a tenant (create/update) and optional Telegram config + settings.

  Usage examples:

  # Using ENV_FILE for DB creds (run with sudo if file is root-only)
  ENV_FILE=/etc/chatorical/support-chat-v2.env \
  SLUG=b-tenant NAME="Tenant B" \
  ALLOWED_ORIGINS="https://stage.chatorical.com" \
  BOT_TOKEN="12345:abcdef" SUPPORT_GROUP_ID="-1001234567890" \
  WEBHOOK_SECRET="pathsecret" HEADER_SECRET="headersecret" \
  npx -y ts-node src/scripts/enroll_tenant.ts

  # Or pass DATABASE_URL directly
  DATABASE_URL=postgres://... \
  SLUG=b-tenant NAME="Tenant B" npx -y ts-node src/scripts/enroll_tenant.ts
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
require("../config/env");
const client_1 = require("../db/client");
const crypto_1 = require("../services/crypto");
const env_1 = require("../config/env");
function loadEnvFromOptionalFile() {
    const p = process.env.ENV_FILE;
    if (p && fs_1.default.existsSync(p)) {
        dotenv_1.default.config({ path: path_1.default.resolve(p) });
    }
}
function getEnv(name, required = false) {
    const v = process.env[name];
    if (required && (!v || v.trim() === '')) {
        throw new Error(`Missing required env: ${name}`);
    }
    return v;
}
async function main() {
    loadEnvFromOptionalFile();
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL not set. Provide ENV_FILE or export DATABASE_URL.');
    }
    const slug = getEnv('SLUG', true).trim();
    const name = getEnv('NAME', true).trim();
    const allowedOrigins = (getEnv('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
    const botToken = (getEnv('BOT_TOKEN') || '').trim();
    const supportGroupId = (getEnv('SUPPORT_GROUP_ID') || '').trim();
    const webhookSecret = (getEnv('WEBHOOK_SECRET') || '').trim();
    const headerSecret = (getEnv('HEADER_SECRET') || '').trim();
    const defaultTopicIdRaw = (getEnv('DEFAULT_TOPIC_ID') || '').trim();
    const defaultTopicId = defaultTopicIdRaw ? Number(defaultTopicIdRaw) : NaN;
    const webhookBase = (getEnv('WEBHOOK_BASE') || env_1.CONFIG.publicOrigin || '').trim();
    const prisma = (0, client_1.getPrisma)();
    // Upsert tenant
    let tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (tenant) {
        tenant = await prisma.tenant.update({ where: { id: tenant.id }, data: { name } });
    }
    else {
        tenant = await prisma.tenant.create({ data: { slug, name } });
    }
    const out = { ok: true, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name } };
    // Optional: Telegram channel config
    if (botToken && supportGroupId && webhookSecret) {
        const enc = (0, crypto_1.encryptJsonEnvelope)({ botToken, supportGroupId, headerSecret: headerSecret || undefined });
        const ch = await prisma.channel.upsert({
            where: { webhookSecret },
            update: { encConfig: enc, headerSecret: headerSecret || null, status: 'active' },
            create: { tenantId: tenant.id, type: 'telegram', encConfig: enc, webhookSecret, headerSecret: headerSecret || null },
        });
        out.channel = { id: ch.id, hasHeaderSecret: Boolean(ch.headerSecret) };
        // Optionally set Telegram webhook if we know the base URL
        if (webhookBase && webhookBase.startsWith('http')) {
            const base = webhookBase.replace(/\/$/, '');
            const webhookUrl = `${base}/v1/telegram/webhook/${webhookSecret}`;
            out.telegram = { webhookUrl };
            try {
                const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ url: webhookUrl, secret_token: headerSecret || undefined, allowed_updates: ['message', 'channel_post', 'chat_member', 'my_chat_member'] }),
                });
                const data = await res.json().catch(() => ({}));
                out.telegram.setWebhookOk = Boolean(data && data.ok === true);
                // Fetch getWebhookInfo to surface any last_error_message quickly
                try {
                    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
                    const info = await infoRes.json().catch(() => ({}));
                    const lem = info && info.result && info.result.last_error_message ? String(info.result.last_error_message) : undefined;
                    if (lem)
                        out.telegram.lastErrorMessage = lem;
                }
                catch { }
            }
            catch { }
        }
    }
    // Optional: settings
    const settings = {};
    if (allowedOrigins.length > 0) {
        const value = allowedOrigins.join(', ');
        await prisma.setting.upsert({
            where: { tenantId_key: { tenantId: tenant.id, key: 'allowedOrigins' } },
            update: { value },
            create: { tenantId: tenant.id, key: 'allowedOrigins', value },
        });
        settings['allowedOrigins'] = value;
    }
    if (Number.isFinite(defaultTopicId)) {
        const value = String(defaultTopicId);
        await prisma.setting.upsert({
            where: { tenantId_key: { tenantId: tenant.id, key: 'telegram.defaultTopicId' } },
            update: { value },
            create: { tenantId: tenant.id, key: 'telegram.defaultTopicId', value },
        });
        settings['telegram.defaultTopicId'] = value;
    }
    if (Object.keys(settings).length > 0) {
        out.settings = settings;
    }
    console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
