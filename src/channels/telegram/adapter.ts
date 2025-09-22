import { getPrisma } from '../../db/client';
import { encryptJsonEnvelope, decryptJsonEnvelope } from '../../services/crypto';
// Use global fetch in Node 18+; fallback to dynamic import if needed
const fetchFn: any = (globalThis as any).fetch ? (globalThis as any).fetch.bind(globalThis) : undefined;
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

export async function sendTelegramText(botToken: string, chatId: string | number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = { chat_id: chatId, text, disable_notification: true };
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
          return;
        }
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


