import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import pinoHttp from 'pino-http';
import { CONFIG } from './config/env';
import { logger } from './telemetry/logger';
import { requestId } from './middleware/requestId';
import { getCommaListSetting } from './services/settings';
import { tenantContext } from './middleware/tenantContext';
import { attachWsServer } from './ws/server';
import publicV1 from './api/publicV1';
import { telegramRouter } from './channels/telegram/webhook';
import adminTest from './api/adminTest';
import adminKeys from './api/adminKeys';
import adminTelegram from './api/adminTelegram';
import adminOutbox from './api/adminOutbox';
import adminTemplates, { previewTemplatesRouter } from './api/adminTemplates';
import adminI18n, { publicI18nRouter } from './api/adminI18n';
import adminSettings from './api/adminSettings';
import { getMetricsText } from './telemetry/metrics';
import { startRedisHub } from './ws/redisHub';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { errorEnvelope } from './middleware/errorEnvelope';
import { runWithSpan } from './telemetry/tracing';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));
app.use(requestId);
app.use(async (req, res, next) => {
  const origin = req.header('origin') || undefined;
  if (!origin) return next();
  try {
    const tenantId: string = (req as any).tenant?.tenantId || 'default';
    const dynamicOrigins = await getCommaListSetting(tenantId, 'allowedOrigins');
    const allowed = new Set([...CONFIG.allowedOrigins, ...dynamicOrigins]);
    if (allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      return next();
    }
    return res.status(403).json({ error: 'cors_denied' });
  } catch {
    return next();
  }
});
app.use(helmet());
app.use(pinoHttp({ logger, customProps: (req) => ({ tenant_id: (req as any).tenant?.tenantId, request_id: (req as any).requestId }) }));
app.use(apiKeyAuth);
app.use(tenantContext);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => {
  const required = ['DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter(k => !(process.env as any)[k] || String((process.env as any)[k]).trim()==='');
  if (missing.length > 0) return res.status(503).json({ ready: false, missing });
  return res.json({ ready: true });
});

app.get('/metrics', (_req, res) => {
  try {
    const text = getMetricsText();
    res.type('text/plain').send(text);
  } catch {
    res.status(500).type('text/plain').send('error');
  }
});

// v1-compatible public routes (stubs) — keep paths for default tenant
app.use(publicV1);
app.use(telegramRouter());
app.use(adminTest);
app.use(adminKeys);
app.use(adminTelegram);
app.use(adminOutbox);
app.use((req, _res, next) => { runWithSpan('http.request', () => {}, { path: req.path, method: req.method }); next(); });
app.use(previewTemplatesRouter);
app.use(adminTemplates);
app.use(publicI18nRouter);
app.use(adminI18n);
app.use(adminSettings);

// Error envelope
app.use(errorEnvelope);

// WS: will be attached at /v1/ws in a follow-up scaffold

// Widget delivery: placeholder for /widget.js (served by app or proxy to static build)
app.get('/widget.js', (_req, res) => {
  res.type('application/javascript').send('// v2 widget placeholder');
});

const server = http.createServer(app);
attachWsServer(server, '/v1/ws');
startRedisHub();
server.listen(CONFIG.port, CONFIG.bindHost, () => {
  logger.info({ event: 'server_listening', port: CONFIG.port, host: CONFIG.bindHost });
});


