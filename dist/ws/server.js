"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWsServer = attachWsServer;
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const logger_1 = require("../telemetry/logger");
const auth_1 = require("../services/auth");
const settings_1 = require("../services/settings");
const hub_1 = require("./hub");
const metrics_1 = require("../telemetry/metrics");
const env_1 = require("../config/env");
function attachWsServer(httpServer, pathPrefix = '/v1/ws') {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    httpServer.on('upgrade', async (request, socket, head) => {
        try {
            const url = new URL(request.url || '/', 'http://localhost');
            if (!url.pathname.startsWith(pathPrefix))
                return;
            const token = url.searchParams.get('token') || '';
            if (!token) {
                socket.destroy();
                return;
            }
            const xff = (request.headers && request.headers['x-forwarded-for']) || '';
            const ip = (xff.split(',')[0].trim() || request.socket?.remoteAddress || '').toString();
            const ipHash = (0, auth_1.hashIp)(ip);
            let conversationId;
            let tenantId;
            try {
                const parsed = (0, auth_1.verifyConversationToken)(token, ipHash);
                conversationId = parsed.conversationId;
                tenantId = parsed.tenantId;
            }
            catch {
                socket.destroy();
                return;
            }
            const origin = request.headers?.origin;
            if (origin) {
                let ok = env_1.CONFIG.allowedOrigins.length === 0 || env_1.CONFIG.allowedOrigins.includes(origin);
                try {
                    if (tenantId) {
                        const dynamicOrigins = await (0, settings_1.getCommaListSetting)(tenantId, 'allowedOrigins');
                        if (!ok)
                            ok = dynamicOrigins.includes(origin);
                    }
                }
                catch { }
                if (!ok) {
                    socket.destroy();
                    return;
                }
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, conversationId);
            });
        }
        catch (e) {
            try {
                logger_1.logger.warn({ event: 'ws_upgrade_exception', err: e });
            }
            catch { }
            socket.destroy();
        }
    });
    wss.on('connection', (ws, conversationId) => {
        const id = conversationId || (0, crypto_1.randomUUID)();
        try {
            logger_1.logger.info({ event: 'ws_connected', id });
        }
        catch { }
        (0, metrics_1.incWsConnections)(1);
        if (conversationId)
            (0, hub_1.addClientToConversation)(conversationId, ws);
        // Best-effort: tenant id derivation is not currently in scope within ws/hub; future enhancement can map conv->tenant.
        try {
            // No direct tenantId here without a repo lookup; keep a neutral update for now.
            // Placeholder for future: incWsConnectionsForTenant(tenantId, 1)
        }
        catch { }
        ws.on('message', (_data) => {
            // v1 echo semantics will be added with auth/token validation
        });
        ws.on('close', () => {
            if (conversationId)
                (0, hub_1.removeClientFromConversation)(conversationId, ws);
            try {
                logger_1.logger.info({ event: 'ws_closed', id });
            }
            catch { }
            (0, metrics_1.incWsConnections)(-1);
            try {
                // Placeholder for future tenant-scoped decrement
                // incWsConnectionsForTenant(tenantId, -1)
            }
            catch { }
        });
        try {
            ws.send(JSON.stringify({ ok: true }));
        }
        catch { }
    });
    return wss;
}
