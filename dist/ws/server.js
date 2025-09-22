"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWsServer = attachWsServer;
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const logger_1 = require("../telemetry/logger");
const auth_1 = require("../services/auth");
const hub_1 = require("./hub");
function attachWsServer(httpServer, pathPrefix = '/v1/ws') {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (request, socket, head) => {
        try {
            const url = new URL(request.url || '/', 'http://localhost');
            if (!url.pathname.startsWith(pathPrefix))
                return;
            const token = url.searchParams.get('token') || '';
            if (!token) {
                socket.destroy();
                return;
            }
            try {
                (0, auth_1.verifyConversationToken)(token, '');
            }
            catch {
                socket.destroy();
                return;
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws);
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
        if (conversationId)
            (0, hub_1.addClientToConversation)(conversationId, ws);
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
        });
        try {
            ws.send(JSON.stringify({ ok: true }));
        }
        catch { }
    });
    return wss;
}
