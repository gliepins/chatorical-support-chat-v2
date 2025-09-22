import { Prisma } from '@prisma/client';
import { getPrisma } from '../db/client';

export async function createConversation(tenantId: string, name?: string, locale?: string) {
  const prisma = getPrisma();
  const data: Prisma.ConversationCreateInput = {
    tenant: { connect: { id: tenantId } },
    codename: `C-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    ...(name ? { customerName: name.trim() } : {}),
    ...(locale ? { locale: locale.trim().toLowerCase().slice(0,2) as any } : {}),
  } as any;
  const conv = await (prisma as any).conversation.create({ data });
  return conv;
}

export async function listMessages(tenantId: string, conversationId: string) {
  const prisma = getPrisma();
  const msgs = await prisma.message.findMany({ where: { tenantId, conversationId }, orderBy: { createdAt: 'asc' } });
  return msgs.map(m => ({ createdAt: m.createdAt, direction: m.direction, text: m.text }));
}

export async function getConversationById(tenantId: string, conversationId: string) {
  const prisma = getPrisma();
  return prisma.conversation.findFirst({ where: { tenantId, id: conversationId } });
}

export async function findConversationByThreadId(tenantId: string, threadId: number) {
  const prisma = getPrisma();
  return prisma.conversation.findFirst({ where: { tenantId, threadId } });
}

export async function createConversationWithThread(tenantId: string, threadId: number, title?: string) {
  const prisma = getPrisma();
  const codename = `C-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const data: any = {
    tenant: { connect: { id: tenantId } },
    codename,
    threadId,
    status: 'OPEN_UNCLAIMED',
    ...(title ? { aboutNote: title } : {}),
  };
  return (prisma as any).conversation.create({ data });
}

export async function addAgentOutboundMessage(tenantId: string, conversationId: string, text: string) {
  const prisma = getPrisma();
  const trimmed = text.trim();
  if (!trimmed) return null as any;
  const msg = await prisma.message.create({
    data: { tenantId, conversationId, direction: 'OUTBOUND' as any, text: trimmed },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastAgentAt: new Date() } });
  return msg;
}

export async function addAgentInboundMessage(tenantId: string, conversationId: string, text: string) {
  const prisma = getPrisma();
  const trimmed = text.trim();
  if (!trimmed) return null as any;
  const msg = await prisma.message.create({
    data: { tenantId, conversationId, direction: 'INBOUND' as any, text: trimmed },
  });
  // Agent responded (inbound to customer), still update lastAgentAt
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastAgentAt: new Date() } });
  return msg;
}

export async function setConversationThreadId(tenantId: string, conversationId: string, threadId: number) {
  const prisma = getPrisma();
  const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { threadId } });
  if (conv.tenantId !== tenantId) {
    throw new Error('cross_tenant_forbidden');
  }
  return conv as any;
}

export async function findOrCreateRootConversation(tenantId: string, title?: string) {
  const prisma = getPrisma();
  const existing = await prisma.conversation.findFirst({ where: { tenantId, threadId: null } as any });
  if (existing) return existing;
  const codename = `G-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const data: any = {
    tenant: { connect: { id: tenantId } },
    codename,
    status: 'OPEN_UNCLAIMED',
    ...(title ? { aboutNote: title } : {}),
  };
  return (prisma as any).conversation.create({ data });
}

export async function updateConversationName(tenantId: string, conversationId: string, name: string) {
  const prisma = getPrisma();
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error('name_required');
  const conv = await prisma.conversation.update({
    where: { id: conversationId },
    data: { customerName: trimmed },
  });
  if (conv.tenantId !== tenantId) {
    throw new Error('cross_tenant_forbidden');
  }
  return conv as any;
}

export async function addCustomerInboundMessage(tenantId: string, conversationId: string, text: string) {
  const prisma = getPrisma();
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('empty_message');
  const conv = await prisma.conversation.findFirst({ where: { tenantId, id: conversationId } });
  if (!conv) throw new Error('conversation_not_found');
  const msg = await prisma.message.create({ data: { tenantId, conversationId, direction: 'INBOUND' as any, text: trimmed } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastCustomerAt: new Date() } });
  return msg;
}


