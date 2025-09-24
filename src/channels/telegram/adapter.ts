import { getPrisma } from '../../db/client';
import { encryptJsonEnvelope, decryptJsonEnvelope } from '../../services/crypto';
// Use global fetch in Node 18+; fallback to dynamic import if needed
const fetchFn: any = (globalThis as any).fetch ? (globalThis as any).fetch.bind(globalThis) : undefined;
import { logger } from '../../telemetry/logger';
import { enqueueOutbox } from '../../services/outbox';
import { incTelegramErrors, incTelegramSends } from '../../telemetry/metrics';

type TelegramConfig = {
  botToken: string;
  supportGroupId: string;
  headerSecret?: string;
};

export async function upsertTelegramChannel(tenantId: string, config: TelegramConfig, webhookSecret: string) {
  const prisma = getPrisma();
  const enc = encryptJsonEnvelope(config);
  const row = await (prisma as any).channel.upsert({
    where: { webhookSecret },
    update: { encConfig: enc, headerSecret: config.headerSecret || null },
    create: { tenantId, type: 'telegram', encConfig: enc, webhookSecret, headerSecret: config.headerSecret || null },
  });
  return row;
}

export async function getTelegramConfigByWebhookSecret(webhookSecret: string): Promise<{ tenantId: string; config: TelegramConfig } | null> {
  const prisma = getPrisma();
  const row = await (prisma as any).channel.findUnique({ where: { webhookSecret } });
  if (!row) return null;
  const cfg = decryptJsonEnvelope(row.encConfig) as TelegramConfig;
  return { tenantId: row.tenantId as string, config: cfg };
}

export async function getTelegramConfigByHeaderSecret(tenantId: string, headerSecret: string): Promise<{ tenantId: string; config: TelegramConfig } | null> {
  const prisma = getPrisma();
  const row = await (prisma as any).channel.findFirst({ where: { tenantId, type: 'telegram', headerSecret } });
  if (!row) return null;
  const cfg = decryptJsonEnvelope(row.encConfig) as TelegramConfig;
  return { tenantId: row.tenantId as string, config: cfg };
}

export async function sendTelegramText(botToken: string, chatId: string | number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = { chat_id: chatId, text, disable_notification: true } as any;
  let attempts = 0;
  // up to 3 attempts with respect to retry_after
  while (attempts < 3) {
    attempts++;
    try {
      const fetchImpl = fetchFn || (async () => { throw new Error('fetch not available'); }) as any;
      const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (res && typeof res.json === 'function') {
        const data = await res.json();
        if (data && data.ok === true) {
          incTelegramSends(1);
          try { logger.info({ event: 'tg_send_ok', chatId, hasThread: Boolean(body.message_thread_id) }); } catch {}
          return;
        }
        try { logger.warn({ event: 'tg_send_fail', chatId, hasThread: Boolean(body.message_thread_id), description: data?.description }); } catch {}
        const retryAfter = Number(data?.parameters?.retry_after || 0);
        if (retryAfter > 0 && attempts < 3) {
          await new Promise(r => setTimeout(r, Math.min((retryAfter + 1) * 1000, 15000)));
          continue;
        }
        incTelegramErrors(1);
        return;
      }
      // Non-JSON response
      incTelegramErrors(1);
      return;
    } catch {
      incTelegramErrors(1);
      return;
    }
  }
}

export async function sendTelegramTextInThread(botToken: string, chatId: string | number, threadId: number | undefined, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: any = { chat_id: chatId, text, disable_notification: true };
  if (typeof threadId === 'number' && Number.isFinite(threadId)) body.message_thread_id = threadId;
  let attempts = 0;
  const fetchImpl = fetchFn || (async () => { throw new Error('fetch not available'); }) as any;
  while (attempts < 3) {
    attempts++;
    try {
      const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (res && typeof res.json === 'function') {
        const data = await res.json();
        if (data && data.ok === true) {
          incTelegramSends(1);
          try { logger.info({ event: 'tg_send_ok', chatId, threadId }); } catch {}
          return;
        }
        try { logger.warn({ event: 'tg_send_fail', chatId, threadId, description: data?.description }); } catch {}
        const retryAfter = Number(data?.parameters?.retry_after || 0);
        if (retryAfter > 0 && attempts < 3) {
          await new Promise(r => setTimeout(r, Math.min((retryAfter + 1) * 1000, 15000)));
          continue;
        }
        incTelegramErrors(1);
        return;
      }
      incTelegramErrors(1);
      return;
    } catch {
      incTelegramErrors(1);
      return;
    }
  }
}

// Enqueue variants for durability
export async function enqueueTelegramText(tenantId: string, chatId: string | number, text: string, key?: string): Promise<void> {
  await enqueueOutbox(tenantId, 'telegram_send', { chatId, text }, key);
}

export async function enqueueTelegramTextInThread(tenantId: string, chatId: string | number, threadId: number, text: string, key?: string): Promise<void> {
  await enqueueOutbox(tenantId, 'telegram_send', { chatId, text, message_thread_id: threadId }, key);
}

export async function createTelegramForumTopic(botToken: string, chatId: string | number, name: string): Promise<number | undefined> {
  const url = `https://api.telegram.org/bot${botToken}/createForumTopic`;
  const body: any = { chat_id: chatId, name };
  try {
    const fetchImpl = fetchFn || (async () => { throw new Error('fetch not available'); }) as any;
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res && typeof res.json === 'function') {
      const data: any = await res.json();
      if (data && data.ok === true) {
        // Telegram returns result.message_thread_id for created topic
        const tid = Number(data?.result?.message_thread_id);
        if (Number.isFinite(tid)) return tid;
      }
    }
  } catch {
    // ignore — fall back to group root
  }
  return undefined;
}


