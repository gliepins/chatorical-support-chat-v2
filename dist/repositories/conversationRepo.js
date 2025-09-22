"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConversation = createConversation;
exports.listMessages = listMessages;
exports.getConversationById = getConversationById;
exports.findConversationByThreadId = findConversationByThreadId;
exports.createConversationWithThread = createConversationWithThread;
exports.addAgentOutboundMessage = addAgentOutboundMessage;
exports.addAgentInboundMessage = addAgentInboundMessage;
exports.setConversationThreadId = setConversationThreadId;
exports.findOrCreateRootConversation = findOrCreateRootConversation;
exports.updateConversationName = updateConversationName;
exports.addCustomerInboundMessage = addCustomerInboundMessage;
const client_1 = require("../db/client");
async function createConversation(tenantId, name, locale) {
    const prisma = (0, client_1.getPrisma)();
    const data = {
        tenant: { connect: { id: tenantId } },
        codename: `C-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        ...(name ? { customerName: name.trim() } : {}),
        ...(locale ? { locale: locale.trim().toLowerCase().slice(0, 2) } : {}),
    };
    const conv = await prisma.conversation.create({ data });
    return conv;
}
async function listMessages(tenantId, conversationId) {
    const prisma = (0, client_1.getPrisma)();
    const msgs = await prisma.message.findMany({ where: { tenantId, conversationId }, orderBy: { createdAt: 'asc' } });
    return msgs.map(m => ({ createdAt: m.createdAt, direction: m.direction, text: m.text }));
}
async function getConversationById(tenantId, conversationId) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.conversation.findFirst({ where: { tenantId, id: conversationId } });
}
async function findConversationByThreadId(tenantId, threadId) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.conversation.findFirst({ where: { tenantId, threadId } });
}
async function createConversationWithThread(tenantId, threadId, title) {
    const prisma = (0, client_1.getPrisma)();
    const codename = `C-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const data = {
        tenant: { connect: { id: tenantId } },
        codename,
        threadId,
        status: 'OPEN_UNCLAIMED',
        ...(title ? { aboutNote: title } : {}),
    };
    return prisma.conversation.create({ data });
}
async function addAgentOutboundMessage(tenantId, conversationId, text) {
    const prisma = (0, client_1.getPrisma)();
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    const msg = await prisma.message.create({
        data: { tenantId, conversationId, direction: 'OUTBOUND', text: trimmed },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastAgentAt: new Date() } });
    return msg;
}
async function addAgentInboundMessage(tenantId, conversationId, text) {
    const prisma = (0, client_1.getPrisma)();
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    const msg = await prisma.message.create({
        data: { tenantId, conversationId, direction: 'INBOUND', text: trimmed },
    });
    // Agent responded (inbound to customer), still update lastAgentAt
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastAgentAt: new Date() } });
    return msg;
}
async function setConversationThreadId(tenantId, conversationId, threadId) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { threadId } });
    if (conv.tenantId !== tenantId) {
        throw new Error('cross_tenant_forbidden');
    }
    return conv;
}
async function findOrCreateRootConversation(tenantId, title) {
    const prisma = (0, client_1.getPrisma)();
    const existing = await prisma.conversation.findFirst({ where: { tenantId, threadId: null } });
    if (existing)
        return existing;
    const codename = `G-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const data = {
        tenant: { connect: { id: tenantId } },
        codename,
        status: 'OPEN_UNCLAIMED',
        ...(title ? { aboutNote: title } : {}),
    };
    return prisma.conversation.create({ data });
}
async function updateConversationName(tenantId, conversationId, name) {
    const prisma = (0, client_1.getPrisma)();
    const trimmed = name.trim();
    if (trimmed.length === 0)
        throw new Error('name_required');
    const conv = await prisma.conversation.update({
        where: { id: conversationId },
        data: { customerName: trimmed },
    });
    if (conv.tenantId !== tenantId) {
        throw new Error('cross_tenant_forbidden');
    }
    return conv;
}
async function addCustomerInboundMessage(tenantId, conversationId, text) {
    const prisma = (0, client_1.getPrisma)();
    const trimmed = (text || '').trim();
    if (!trimmed)
        throw new Error('empty_message');
    const conv = await prisma.conversation.findFirst({ where: { tenantId, id: conversationId } });
    if (!conv)
        throw new Error('conversation_not_found');
    const msg = await prisma.message.create({ data: { tenantId, conversationId, direction: 'INBOUND', text: trimmed } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastCustomerAt: new Date() } });
    return msg;
}
