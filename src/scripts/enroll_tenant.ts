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

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import '../config/env';
import { getPrisma } from '../db/client';
import { encryptJsonEnvelope } from '../services/crypto';
import { CONFIG } from '../config/env';

type Result = {
  ok: true;
  tenant: { id: string; slug: string; name: string };
  channel?: { id: string; hasHeaderSecret: boolean };
  settings?: Record<string, string>;
  telegram?: { webhookUrl?: string; setWebhookOk?: boolean; lastErrorMessage?: string };
};

function loadEnvFromOptionalFile(): void {
  const p = process.env.ENV_FILE;
  if (p && fs.existsSync(p)) {
    dotenv.config({ path: path.resolve(p) });
  }
}

function getEnv(name: string, required = false): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

async function main(): Promise<void> {
  loadEnvFromOptionalFile();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set. Provide ENV_FILE or export DATABASE_URL.');
  }

  const slug = (getEnv('SLUG', true) as string).trim();
  const name = (getEnv('NAME', true) as string).trim();
  const allowedOrigins = (getEnv('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const botToken = (getEnv('BOT_TOKEN') || '').trim();
  const supportGroupId = (getEnv('SUPPORT_GROUP_ID') || '').trim();
  const webhookSecret = (getEnv('WEBHOOK_SECRET') || '').trim();
  const headerSecret = (getEnv('HEADER_SECRET') || '').trim();
  const defaultTopicIdRaw = (getEnv('DEFAULT_TOPIC_ID') || '').trim();
  const defaultTopicId = defaultTopicIdRaw ? Number(defaultTopicIdRaw) : NaN;
  const webhookBase = (getEnv('WEBHOOK_BASE') || CONFIG.publicOrigin || '').trim();

  const prisma = getPrisma();

  // Upsert tenant
  let tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (tenant) {
    tenant = await prisma.tenant.update({ where: { id: tenant.id }, data: { name } });
  } else {
    tenant = await prisma.tenant.create({ data: { slug, name } });
  }

  const out: Result = { ok: true, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name } };

  // Optional: Telegram channel config
  if (botToken && supportGroupId && webhookSecret) {
    const enc = encryptJsonEnvelope({ botToken, supportGroupId, headerSecret: headerSecret || undefined });
    const ch = await (prisma as any).channel.upsert({
      where: { webhookSecret },
      update: { encConfig: enc, headerSecret: headerSecret || null, status: 'active' },
      create: { tenantId: tenant.id, type: 'telegram', encConfig: enc, webhookSecret, headerSecret: headerSecret || null },
    });
    out.channel = { id: ch.id as string, hasHeaderSecret: Boolean(ch.headerSecret) };

    // Optionally set Telegram webhook if we know the base URL
    if (webhookBase && webhookBase.startsWith('http')) {
      const base = webhookBase.replace(/\/$/, '');
      const webhookUrl = `${base}/v1/telegram/webhook/${webhookSecret}`;
      out.telegram = { webhookUrl };
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl, secret_token: headerSecret || undefined, allowed_updates: [ 'message', 'channel_post', 'chat_member', 'my_chat_member' ] }),
        } as any);
        const data: any = await (res as any).json().catch(() => ({}));
        out.telegram.setWebhookOk = Boolean(data && data.ok === true);
        // Fetch getWebhookInfo to surface any last_error_message quickly
        try {
          const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
          const info: any = await (infoRes as any).json().catch(() => ({}));
          const lem = info && info.result && info.result.last_error_message ? String(info.result.last_error_message) : undefined;
          if (lem) out.telegram.lastErrorMessage = lem;
        } catch {}
      } catch {}
    }
  }

  // Optional: settings
  const settings: Record<string, string> = {};
  if (allowedOrigins.length > 0) {
    const value = allowedOrigins.join(', ');
    await (prisma as any).setting.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: 'allowedOrigins' } },
      update: { value },
      create: { tenantId: tenant.id, key: 'allowedOrigins', value },
    });
    settings['allowedOrigins'] = value;
  }
  if (Number.isFinite(defaultTopicId)) {
    const value = String(defaultTopicId);
    await (prisma as any).setting.upsert({
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


