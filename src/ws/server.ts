import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logger } from '../telemetry/logger';
import { verifyConversationToken, hashIp } from '../services/auth';
import { getCommaListSetting } from '../services/settings';
import { addClientToConversation, removeClientFromConversation } from './hub';
import { incWsConnections, incWsConnectionsForTenant } from '../telemetry/metrics';
import { CONFIG } from '../config/env';

export function attachWsServer(httpServer: Server, pathPrefix = '/v1/ws') {
  const wss = new WebSocketServer({ noServer: true });

  (httpServer as any).on('upgrade', async (request: any, socket: any, head: any) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (!url.pathname.startsWith(pathPrefix)) return;
      const token = url.searchParams.get('token') || '';
      if (!token) { socket.destroy(); return; }
      const xff = (request.headers && (request.headers['x-forwarded-for'] as string)) || '';
      const ip = (xff.split(',')[0].trim() || request.socket?.remoteAddress || '').toString();
      const ipHash = hashIp(ip);
      let conversationId: string | undefined;
      let tenantId: string | undefined;
      try { const parsed = verifyConversationToken(token, ipHash); conversationId = parsed.conversationId; tenantId = parsed.tenantId; } catch { socket.destroy(); return; }
      const origin = request.headers?.origin as string | undefined;
      if (origin) {
        let ok = CONFIG.allowedOrigins.length === 0 || CONFIG.allowedOrigins.includes(origin);
        try {
          if (tenantId) {
            const dynamicOrigins = await getCommaListSetting(tenantId, 'allowedOrigins');
            if (!ok) ok = dynamicOrigins.includes(origin);
          }
        } catch {}
        if (!ok) { socket.destroy(); return; }
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, conversationId);
      });
    } catch (e) {
      try { logger.warn({ event: 'ws_upgrade_exception', err: e }); } catch {}
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, conversationId?: string) => {
    const id = conversationId || randomUUID();
    try { logger.info({ event: 'ws_connected', id }); } catch {}
    incWsConnections(1);
    if (conversationId) addClientToConversation(conversationId, ws);
    // Best-effort: tenant id derivation is not currently in scope within ws/hub; future enhancement can map conv->tenant.
    try {
      // No direct tenantId here without a repo lookup; keep a neutral update for now.
      // Placeholder for future: incWsConnectionsForTenant(tenantId, 1)
    } catch {}
    ws.on('message', (_data: unknown) => {
      // v1 echo semantics will be added with auth/token validation
    });
    ws.on('close', () => {
      if (conversationId) removeClientFromConversation(conversationId, ws);
      try { logger.info({ event: 'ws_closed', id }); } catch {}
      incWsConnections(-1);
      try {
        // Placeholder for future tenant-scoped decrement
        // incWsConnectionsForTenant(tenantId, -1)
      } catch {}
    });
    try { ws.send(JSON.stringify({ ok: true })); } catch {}
  });

  return wss;
}


