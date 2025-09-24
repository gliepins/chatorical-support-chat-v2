"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureTopicForConversation = ensureTopicForConversation;
const client_1 = require("../../db/client");
const crypto_1 = require("../../services/crypto");
const settings_1 = require("../../services/settings");
const adapter_1 = require("./adapter");
/**
 * Ensure a Telegram forum topic exists for this conversation and return the thread id.
 * Mirrors v1 behavior, but scoped by tenant.
 */
async function ensureTopicForConversation(tenantId, conversationId) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findFirst({ where: { tenantId, id: conversationId } });
    if (!conv)
        throw new Error('conversation_not_found');
    if (typeof conv.threadId === 'number' && Number.isFinite(conv.threadId))
        return conv.threadId;
    // Load Telegram channel config for this tenant
    const ch = await prisma.channel.findFirst({ where: { tenantId, type: 'telegram' } });
    if (!ch)
        return undefined;
    const cfg = (0, crypto_1.decryptJsonEnvelope)(ch.encConfig);
    if (!cfg || !cfg.botToken || !cfg.supportGroupId)
        return undefined;
    // Try to create a new topic using the conversation codename (or name)
    const title = (conv.customerName ? `${conv.customerName} — ${conv.codename}` : conv.codename);
    let threadId;
    try {
        const created = await (0, adapter_1.createTelegramForumTopic)(cfg.botToken, cfg.supportGroupId, String(title).slice(0, 128));
        if (typeof created === 'number' && Number.isFinite(created))
            threadId = created;
    }
    catch {
        // ignore
    }
    if (typeof threadId !== 'number') {
        // Fallback to default topic if configured
        try {
            const defTidStr = await (0, settings_1.getSetting)(tenantId, 'telegram.defaultTopicId');
            const parsed = defTidStr ? Number(defTidStr) : NaN;
            if (Number.isFinite(parsed))
                threadId = parsed;
        }
        catch { }
        // As a last resort in forum groups, many setups use General topic id = 1
        if (typeof threadId !== 'number') {
            threadId = 1;
        }
    }
    if (typeof threadId === 'number') {
        try {
            await prisma.conversation.update({ where: { id: conversationId }, data: { threadId } });
        }
        catch { }
    }
    return threadId;
}
