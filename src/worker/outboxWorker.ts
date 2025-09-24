import { claimNextOutbox, markDone, markFailed } from '../services/outbox';
import { sendTelegramText, sendTelegramTextInThread } from '../channels/telegram/adapter';
import { getPrisma } from '../db/client';
import { decryptJsonEnvelope } from '../services/crypto';
import { runWithSpan } from '../telemetry/tracing';

export async function processOnce(): Promise<boolean> {
  const item = await claimNextOutbox(new Date());
  if (!item) return false;
  try {
    if (item.type === 'telegram_send') {
      const { tenantId, payload } = item as any;
      const prisma = getPrisma();
      const ch = await runWithSpan('outbox.lookupChannel', () => (prisma as any).channel.findFirst({ where: { tenantId, type: 'telegram' }, orderBy: { updatedAt: 'desc' } }), { tenant_id: tenantId });
      if (!ch) throw new Error('telegram_channel_missing');
      const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string };
      if (typeof payload.message_thread_id === 'number') {
        await runWithSpan('outbox.sendTelegramTextInThread', () => sendTelegramTextInThread(cfg.botToken, payload.chatId, payload.message_thread_id, payload.text), { chat_id: payload.chatId, thread_id: payload.message_thread_id });
      } else {
        await runWithSpan('outbox.sendTelegramText', () => sendTelegramText(cfg.botToken, payload.chatId, payload.text), { chat_id: payload.chatId });
      }
    }
    await markDone(item.id);
  } catch (e: any) {
    const msg = e?.message || 'error';
    const backoff = 2; // simple backoff; could expand based on attempts
    await markFailed(item.id, msg, backoff);
  }
  return true;
}


