import { getPrisma } from '../../db/client';
import { decryptJsonEnvelope } from '../../services/crypto';
import { getSetting } from '../../services/settings';
import { createTelegramForumTopic } from './adapter';

/**
 * Ensure a Telegram forum topic exists for this conversation and return the thread id.
 * Mirrors v1 behavior, but scoped by tenant.
 */
export async function ensureTopicForConversation(tenantId: string, conversationId: string): Promise<number | undefined> {
  const prisma = getPrisma();
  const conv = await (prisma as any).conversation.findFirst({ where: { tenantId, id: conversationId } });
  if (!conv) throw new Error('conversation_not_found');
  if (typeof conv.threadId === 'number' && Number.isFinite(conv.threadId)) return conv.threadId as number;

  // Load Telegram channel config for this tenant
  const ch = await (prisma as any).channel.findFirst({ where: { tenantId, type: 'telegram' } });
  if (!ch) return undefined;
  const cfg = decryptJsonEnvelope(ch.encConfig) as { botToken: string; supportGroupId?: string };
  if (!cfg || !cfg.botToken || !cfg.supportGroupId) return undefined;

  // Try to create a new topic using the conversation codename (or name)
  const title = (conv.customerName ? `${conv.customerName} — ${conv.codename}` : conv.codename) as string;
  let threadId: number | undefined;
  try {
    const created = await createTelegramForumTopic(cfg.botToken, cfg.supportGroupId as any, String(title).slice(0, 128));
    if (typeof created === 'number' && Number.isFinite(created)) threadId = created;
  } catch {
    // ignore
  }
  if (typeof threadId !== 'number') {
    // Fallback to default topic if configured
    try {
      const defTidStr = await getSetting(tenantId, 'telegram.defaultTopicId');
      const parsed = defTidStr ? Number(defTidStr) : NaN;
      if (Number.isFinite(parsed)) threadId = parsed;
    } catch {}
    // As a last resort in forum groups, many setups use General topic id = 1
    if (typeof threadId !== 'number') {
      threadId = 1;
    }
  }
  if (typeof threadId === 'number') {
    try { await prisma.conversation.update({ where: { id: conversationId }, data: { threadId } }); } catch {}
  }
  return threadId;
}


