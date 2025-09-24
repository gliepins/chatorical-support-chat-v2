/*
  Automated checks for a tenant's Telegram wiring.

  Usage:
  sudo ENV_FILE=/etc/chatorical/support-chat-v2.env SLUG=b-tenant npx -y ts-node src/scripts/check_tenant.ts

  Optional:
  WEBHOOK_BASE=https://stage.chatorical.com  # override if CONFIG.publicOrigin is empty
*/

import '../config/env';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getPrisma } from '../db/client';
import { decryptJsonEnvelope } from '../services/crypto';
import { CONFIG } from '../config/env';

type Summary = {
  ok: boolean;
  tenantSlug: string;
  tenantId?: string;
  supportGroupId?: string;
  webhookSecret?: string;
  headerSecretPresent?: boolean;
  webhookUrlExpected?: string;
  telegram?: { url?: string; last_error_message?: string };
  outboxSamples?: Array<{ id: string; status: string; chatId?: string | number; hasThread?: boolean }>;
  webhookSignedPostOk?: boolean;
  notes?: string[];
};

function loadEnvFromOptionalFile(): void {
  const p = process.env.ENV_FILE;
  if (p && fs.existsSync(p)) {
    dotenv.config({ path: path.resolve(p) });
  }
}

async function main(): Promise<void> {
  loadEnvFromOptionalFile();
  const slug = String(process.env.SLUG || '').trim();
  if (!slug) throw new Error('SLUG required');
  const prisma = getPrisma();
  const notes: string[] = [];

  const t = await prisma.tenant.findUnique({ where: { slug } });
  if (!t) throw new Error('tenant_not_found');
  const ch = await (prisma as any).channel.findFirst({ where: { tenantId: t.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
  if (!ch) throw new Error('telegram_channel_not_found');
  const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string; supportGroupId?: string };
  const botToken = cfg.botToken;
  const supportGroupId = cfg.supportGroupId;
  const webhookSecret = ch.webhookSecret as string;
  const headerSecret = ch.headerSecret as string | null;

  const base = (process.env.WEBHOOK_BASE && process.env.WEBHOOK_BASE.trim()) || CONFIG.publicOrigin || '';
  const expectedUrl = base ? `${base.replace(/\/$/, '')}/v1/telegram/webhook/${webhookSecret}` : undefined;

  const summary: Summary = {
    ok: true,
    tenantSlug: slug,
    tenantId: t.id,
    supportGroupId,
    webhookSecret,
    headerSecretPresent: Boolean(headerSecret && headerSecret.length > 0),
    webhookUrlExpected: expectedUrl,
    notes,
  } as Summary;

  // Telegram getWebhookInfo compare
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const data: any = await (res as any).json().catch(() => ({}));
    summary.telegram = { url: data?.result?.url, last_error_message: data?.result?.last_error_message };
    if (expectedUrl && data?.result?.url && expectedUrl !== data.result.url) {
      summary.ok = false;
      notes.push('webhook URL mismatch between Telegram and local config');
    }
    if (data?.result?.last_error_message) {
      summary.ok = false;
      notes.push(`telegram last_error_message: ${data.result.last_error_message}`);
    }
  } catch (e: any) {
    summary.ok = false;
    notes.push(`getWebhookInfo failed: ${e?.message || 'error'}`);
  }

  // Sample recent outbox rows to check chatId routing
  try {
    const rows = await (prisma as any).outbox.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'desc' }, take: 5 });
    summary.outboxSamples = rows.map((r: any) => ({ id: r.id, status: r.status, chatId: r.payload?.chatId, hasThread: typeof r.payload?.message_thread_id === 'number' }));
    if (supportGroupId && Array.isArray(summary.outboxSamples)) {
      for (const it of summary.outboxSamples) {
        if (it.chatId && String(it.chatId) !== String(supportGroupId)) {
          summary.ok = false;
          notes.push(`outbox chatId mismatch (got ${it.chatId}, expected ${supportGroupId})`);
          break;
        }
      }
    }
  } catch {}

  // Signed webhook POST smoke (if we have base and header)
  if (expectedUrl && headerSecret) {
    try {
      const res = await fetch(expectedUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': headerSecret },
        body: JSON.stringify({ update_id: Date.now() % 1000000000, message: { chat: { type: 'supergroup' }, message_thread_id: 1, text: 'ping' } }),
      } as any);
      summary.webhookSignedPostOk = res.ok;
      if (!res.ok) {
        summary.ok = false;
        notes.push(`signed webhook POST returned ${res.status}`);
      }
    } catch (e: any) {
      summary.ok = false;
      notes.push(`signed webhook POST failed: ${e?.message || 'error'}`);
    }
  }

  console.log(JSON.stringify(summary));
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });


