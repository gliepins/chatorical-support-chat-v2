"use strict";
/*
  Automated checks for a tenant's Telegram wiring.

  Usage:
  sudo ENV_FILE=/etc/chatorical/support-chat-v2.env SLUG=b-tenant npx -y ts-node src/scripts/check_tenant.ts

  Optional:
  WEBHOOK_BASE=https://stage.chatorical.com  # override if CONFIG.publicOrigin is empty
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("../db/client");
const crypto_1 = require("../services/crypto");
const env_1 = require("../config/env");
function loadEnvFromOptionalFile() {
    const p = process.env.ENV_FILE;
    if (p && fs_1.default.existsSync(p)) {
        dotenv_1.default.config({ path: path_1.default.resolve(p) });
    }
}
async function main() {
    loadEnvFromOptionalFile();
    const slug = String(process.env.SLUG || '').trim();
    if (!slug)
        throw new Error('SLUG required');
    const prisma = (0, client_1.getPrisma)();
    const notes = [];
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t)
        throw new Error('tenant_not_found');
    const ch = await prisma.channel.findFirst({ where: { tenantId: t.id, type: 'telegram' }, orderBy: { updatedAt: 'desc' } });
    if (!ch)
        throw new Error('telegram_channel_not_found');
    const cfg = (0, crypto_1.decryptJsonEnvelope)(ch.encConfig);
    const botToken = cfg.botToken;
    const supportGroupId = cfg.supportGroupId;
    const webhookSecret = ch.webhookSecret;
    const headerSecret = ch.headerSecret;
    const base = (process.env.WEBHOOK_BASE && process.env.WEBHOOK_BASE.trim()) || env_1.CONFIG.publicOrigin || '';
    const expectedUrl = base ? `${base.replace(/\/$/, '')}/v1/telegram/webhook/${webhookSecret}` : undefined;
    const summary = {
        ok: true,
        tenantSlug: slug,
        tenantId: t.id,
        supportGroupId,
        webhookSecret,
        headerSecretPresent: Boolean(headerSecret && headerSecret.length > 0),
        webhookUrlExpected: expectedUrl,
        notes,
    };
    // Telegram getWebhookInfo compare
    try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const data = await res.json().catch(() => ({}));
        summary.telegram = { url: data?.result?.url, last_error_message: data?.result?.last_error_message };
        if (expectedUrl && data?.result?.url && expectedUrl !== data.result.url) {
            summary.ok = false;
            notes.push('webhook URL mismatch between Telegram and local config');
        }
        if (data?.result?.last_error_message) {
            summary.ok = false;
            notes.push(`telegram last_error_message: ${data.result.last_error_message}`);
        }
    }
    catch (e) {
        summary.ok = false;
        notes.push(`getWebhookInfo failed: ${e?.message || 'error'}`);
    }
    // Sample recent outbox rows to check chatId routing
    try {
        const rows = await prisma.outbox.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'desc' }, take: 5 });
        summary.outboxSamples = rows.map((r) => ({ id: r.id, status: r.status, chatId: r.payload?.chatId, hasThread: typeof r.payload?.message_thread_id === 'number' }));
        if (supportGroupId && Array.isArray(summary.outboxSamples)) {
            for (const it of summary.outboxSamples) {
                if (it.chatId && String(it.chatId) !== String(supportGroupId)) {
                    summary.ok = false;
                    notes.push(`outbox chatId mismatch (got ${it.chatId}, expected ${supportGroupId})`);
                    break;
                }
            }
        }
    }
    catch { }
    // Signed webhook POST smoke (if we have base and header)
    if (expectedUrl && headerSecret) {
        try {
            const res = await fetch(expectedUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': headerSecret },
                body: JSON.stringify({ update_id: Date.now() % 1000000000, message: { chat: { type: 'supergroup' }, message_thread_id: 1, text: 'ping' } }),
            });
            summary.webhookSignedPostOk = res.ok;
            if (!res.ok) {
                summary.ok = false;
                notes.push(`signed webhook POST returned ${res.status}`);
            }
        }
        catch (e) {
            summary.ok = false;
            notes.push(`signed webhook POST failed: ${e?.message || 'error'}`);
        }
    }
    console.log(JSON.stringify(summary));
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
