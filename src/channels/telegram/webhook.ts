import { Router } from 'express';
import { getTelegramConfigByWebhookSecret } from './adapter';
import { logger } from '../../telemetry/logger';
import { incTelegramWebhookOk, incTelegramWebhookUnauthorized, incTelegramWebhookIdempotentSkipped, incTelegramWebhookParseErrors } from '../../telemetry/metrics';
import { findConversationByThreadId, createConversationWithThread, addAgentOutboundMessage, findOrCreateRootConversation } from '../../repositories/conversationRepo';
import { publishToConversation } from '../../ws/redisHub';
import { getRedis } from '../../redis/kv';
import { CONFIG } from '../../config/env';
import { runWithSpan } from '../../telemetry/tracing';

export function telegramRouter(): Router {
  const router = Router();
  router.post('/v1/telegram/webhook/:secret', async (req, res) => {
    const secret = (req.params as any).secret as string;
    try {
      const row = await runWithSpan('telegram.webhook.lookup', () => getTelegramConfigByWebhookSecret(secret), { secret_present: Boolean(secret) });
      if (!row) return res.status(404).json({ ok: false });
      const headerSecret = row.config.headerSecret;
      if (headerSecret) {
        const provided = req.header('x-telegram-bot-api-secret-token');
        if (provided !== headerSecret) { try { incTelegramWebhookUnauthorized(1); } catch {} return res.status(401).json({ ok: false }); }
      }
      const update = req.body as any;

      // Idempotency: ignore duplicate update_id per tenant for a short TTL
      const updateId: number | undefined = (update && typeof update.update_id === 'number') ? update.update_id : undefined;
      if (updateId) {
        try {
          const redis = getRedis();
          const key = `${CONFIG.redisKeyPrefix}tg:idu:${row.tenantId}:${updateId}`;
          const created = await redis.setnx(key, '1');
          if (created === 0) { try { incTelegramWebhookIdempotentSkipped(1); } catch {} return res.json({ ok: true }); }
          await redis.expire(key, 120);
        } catch {}
      }
      try {
        const debug = {
          has_message: !!(update && (update.message || update.edited_message)),
          chat_type: update?.message?.chat?.type || update?.edited_message?.chat?.type,
          thread_id: update?.message?.message_thread_id || update?.edited_message?.message_thread_id,
          text_len: (update?.message?.text || update?.edited_message?.text || '').length,
        };
        logger.info({ debug }, 'telegram update received');
      } catch {}
      const tenantId = row.tenantId;
      const msg = update && (update.message || update.edited_message);
      if (msg && msg.chat && msg.chat.type === 'supergroup') {
        const threadId: number | undefined = msg.message_thread_id as number | undefined;
        const text: string | undefined = msg.text || msg.caption;
        if (typeof text === 'string') {
          try { logger.info({ threadId, textPreview: text.slice(0, 40) }, 'telegram msg parsed'); } catch {}
          if (threadId) {
            let conv = await runWithSpan('telegram.ensureThread', async () => {
              let c = await findConversationByThreadId(tenantId, threadId);
              if (!c) c = await createConversationWithThread(tenantId, threadId, msg.chat.title);
              return c;
            }, { thread_id: threadId });
            if (conv) {
              try { const created = await runWithSpan('telegram.persistMessage', () => addAgentOutboundMessage(tenantId, conv.id, text), { conv_id: conv.id }); try { await publishToConversation(conv.id, { direction: 'OUTBOUND', text: created?.text }); } catch {} } catch (e) { try { logger.warn({ err: e }, 'persist topic msg failed'); } catch {} }
            }
          } else {
            const conv = await runWithSpan('telegram.ensureRoot', () => findOrCreateRootConversation(tenantId, msg.chat.title));
            if (conv) {
              try { const created = await runWithSpan('telegram.persistMessage', () => addAgentOutboundMessage(tenantId, conv.id, text), { conv_id: conv.id }); try { await publishToConversation(conv.id, { direction: 'OUTBOUND', text: created?.text }); } catch {} } catch (e) { try { logger.warn({ err: e }, 'persist root msg failed'); } catch {} }
            }
          }
        }
      }
      try { incTelegramWebhookOk(1); } catch {}
      return res.json({ ok: true });
    } catch (e) {
      // Maintain v1 behavior: return ok even on parse errors
      try { incTelegramWebhookParseErrors(1); } catch {}
      return res.json({ ok: true });
    }
  });
  return router;
}


