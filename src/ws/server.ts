import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logger } from '../telemetry/logger';
import { verifyConversationToken, hashIp } from '../services/auth';
import { addClientToConversation, removeClientFromConversation } from './hub';
import { incWsConnections } from '../telemetry/metrics';
import { CONFIG } from '../config/env';

export function attachWsServer(httpServer: Server, pathPrefix = '/v1/ws') {
  const wss = new WebSocketServer({ noServer: true });

  (httpServer as any).on('upgrade', (request: any, socket: any, head: any) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (!url.pathname.startsWith(pathPrefix)) return;
      const origin = request.headers?.origin as string | undefined;
      if (origin) {
        const ok = CONFIG.allowedOrigins.length === 0 || CONFIG.allowedOrigins.includes(origin);
        if (!ok) { socket.destroy(); return; }
      }
      const token = url.searchParams.get('token') || '';
      if (!token) { socket.destroy(); return; }
      const ip = (request.socket?.remoteAddress || '').toString();
      const ipHash = hashIp(ip);
      try { verifyConversationToken(token, ipHash); } catch { socket.destroy(); return; }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws);
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
    ws.on('message', (_data: unknown) => {
      // v1 echo semantics will be added with auth/token validation
    });
    ws.on('close', () => {
      if (conversationId) removeClientFromConversation(conversationId, ws);
      try { logger.info({ event: 'ws_closed', id }); } catch {}
      incWsConnections(-1);
    });
    try { ws.send(JSON.stringify({ ok: true })); } catch {}
  });

  return wss;
}


