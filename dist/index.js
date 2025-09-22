"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = __importDefault(require("http"));
const pino_http_1 = __importDefault(require("pino-http"));
const env_1 = require("./config/env");
const logger_1 = require("./telemetry/logger");
const requestId_1 = require("./middleware/requestId");
const tenantContext_1 = require("./middleware/tenantContext");
const server_1 = require("./ws/server");
const publicV1_1 = __importDefault(require("./api/publicV1"));
const webhook_1 = require("./channels/telegram/webhook");
const adminTest_1 = __importDefault(require("./api/adminTest"));
const app = (0, express_1.default)();
app.set('trust proxy', true);
app.use(express_1.default.json({ limit: '256kb' }));
app.use(requestId_1.requestId);
app.use((0, cors_1.default)({ origin: (origin, cb) => {
        if (!origin)
            return cb(null, true);
        const ok = env_1.CONFIG.allowedOrigins.includes(origin);
        return cb(ok ? null : new Error('CORS'), ok);
    }, credentials: false }));
app.use((0, helmet_1.default)());
app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
app.use(tenantContext_1.tenantContext);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => {
    const required = ['DATABASE_URL', 'REDIS_URL'];
    const missing = required.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
    if (missing.length > 0)
        return res.status(503).json({ ready: false, missing });
    return res.json({ ready: true });
});
// v1-compatible public routes (stubs) — keep paths for default tenant
app.use(publicV1_1.default);
app.use((0, webhook_1.telegramRouter)());
app.use(adminTest_1.default);
// WS: will be attached at /v1/ws in a follow-up scaffold
// Widget delivery: placeholder for /widget.js (served by app or proxy to static build)
app.get('/widget.js', (_req, res) => {
    res.type('application/javascript').send('// v2 widget placeholder');
});
const server = http_1.default.createServer(app);
(0, server_1.attachWsServer)(server, '/v1/ws');
server.listen(env_1.CONFIG.port, env_1.CONFIG.bindHost, () => {
    logger_1.logger.info({ event: 'server_listening', port: env_1.CONFIG.port, host: env_1.CONFIG.bindHost });
});
