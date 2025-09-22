import { WebSocket } from 'ws';
import { incWsOutbound } from '../telemetry/metrics';

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
}


