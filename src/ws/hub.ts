import { WebSocket } from 'ws';
import { incWsOutbound, incWsOutboundForTenant } from '../telemetry/metrics';
import { getPrisma } from '../db/client';

const conversationIdToClients = new Map<string, Set<WebSocket>>();

export function addClientToConversation(conversationId: string, ws: WebSocket) {
  let set = conversationIdToClients.get(conversationId);
  if (!set) {
    set = new Set<WebSocket>();
    conversationIdToClients.set(conversationId, set);
  }
  set.add(ws);
}

export function removeClientFromConversation(conversationId: string, ws: WebSocket) {
  const set = conversationIdToClients.get(conversationId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) conversationIdToClients.delete(conversationId);
}

export function broadcastToConversation(conversationId: string, payload: unknown) {
  const set = conversationIdToClients.get(conversationId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    try { ws.send(data); incWsOutbound(1); } catch {}
  }
  // Lightweight tenant counter (best effort)
  try {
    const prisma = getPrisma();
    prisma.conversation.findUnique({ where: { id: conversationId } }).then((conv: any) => {
      if (conv && conv.tenantId) incWsOutboundForTenant(conv.tenantId, 1);
    }).catch(() => {});
  } catch {}
}


