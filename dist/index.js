"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env");
require("./telemetry/initOtel");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = __importDefault(require("http"));
const pino_http_1 = __importDefault(require("pino-http"));
const env_1 = require("./config/env");
const logger_1 = require("./telemetry/logger");
const requestId_1 = require("./middleware/requestId");
const settings_1 = require("./services/settings");
const tenantContext_1 = require("./middleware/tenantContext");
const server_1 = require("./ws/server");
const publicV1_1 = __importDefault(require("./api/publicV1"));
const publicV2_1 = __importDefault(require("./api/publicV2"));
const webhook_1 = require("./channels/telegram/webhook");
const adminTest_1 = __importDefault(require("./api/adminTest"));
const adminKeys_1 = __importDefault(require("./api/adminKeys"));
const adminTelegram_1 = __importDefault(require("./api/adminTelegram"));
const adminOutbox_1 = __importDefault(require("./api/adminOutbox"));
const adminAudit_1 = __importDefault(require("./api/adminAudit"));
const adminTemplates_1 = __importStar(require("./api/adminTemplates"));
const adminI18n_1 = __importStar(require("./api/adminI18n"));
const adminSettings_1 = __importDefault(require("./api/adminSettings"));
const metrics_1 = require("./telemetry/metrics");
const redisHub_1 = require("./ws/redisHub");
const apiKeyAuth_1 = require("./middleware/apiKeyAuth");
const errorEnvelope_1 = require("./middleware/errorEnvelope");
const tracing_1 = require("./telemetry/tracing");
const app = (0, express_1.default)();
app.set('trust proxy', true);
app.use(express_1.default.json({ limit: '256kb' }));
app.use(requestId_1.requestId);
app.use(async (req, res, next) => {
    // Allow widget delivery and favicon without CORS gating
    if (req.path === '/widget.js' || req.path === '/favicon.ico')
        return next();
    const origin = req.header('origin') || undefined;
    if (!origin)
        return next();
    try {
        const host = req.hostname;
        const originHost = new URL(origin).hostname;
        if (originHost === host) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
            if (req.method === 'OPTIONS')
                return res.status(204).end();
            return next();
        }
    }
    catch { }
    try {
        const tenantId = req.tenant?.tenantId || 'default';
        const dynamicOrigins = await (0, settings_1.getCommaListSetting)(tenantId, 'allowedOrigins');
        const allowed = new Set([
            ...env_1.CONFIG.allowedOrigins,
            ...dynamicOrigins,
            ...(env_1.CONFIG.publicOrigin ? [env_1.CONFIG.publicOrigin] : []),
        ]);
        if (allowed.has(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
            if (req.method === 'OPTIONS')
                return res.status(204).end();
            return next();
        }
        return res.status(403).json({ error: 'cors_denied' });
    }
    catch {
        return next();
    }
});
app.use((0, helmet_1.default)());
app.use((0, pino_http_1.default)({ logger: logger_1.logger, customProps: (req) => {
        const tenantId = req.tenant?.tenantId;
        const requestIdVal = req.requestId;
        let traceId;
        let spanId;
        try {
            // Lazy import to avoid hard dependency
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const otel = require('@opentelemetry/api');
            const active = otel.trace.getActiveSpan();
            if (active && typeof active.context === 'function') {
                const ctx = active.spanContext();
                traceId = ctx?.traceId;
                spanId = ctx?.spanId;
            }
        }
        catch { }
        return { tenant_id: tenantId, request_id: requestIdVal, trace_id: traceId, span_id: spanId };
    } }));
app.use(apiKeyAuth_1.apiKeyAuth);
app.use(tenantContext_1.tenantContext);
app.use((req, _res, next) => { try {
    const tenantId = req.tenant?.tenantId || 'default';
    (0, metrics_1.incRequestsForTenant)(tenantId, 1);
}
catch { } next(); });
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// Quiet favicon to avoid 404 and console noise
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/ready', (_req, res) => {
    const required = ['DATABASE_URL', 'REDIS_URL'];
    const missing = required.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
    if (missing.length > 0)
        return res.status(503).json({ ready: false, missing });
    return res.json({ ready: true });
});
app.get('/metrics', (_req, res) => {
    try {
        const text = (0, metrics_1.getMetricsText)();
        res.type('text/plain').send(text);
    }
    catch {
        res.status(500).type('text/plain').send('error');
    }
});
// v1-compatible public routes (stubs) — keep paths for default tenant
app.use(publicV1_1.default);
app.use(publicV2_1.default);
app.use((0, webhook_1.telegramRouter)());
app.use(adminTest_1.default);
app.use(adminKeys_1.default);
app.use(adminTelegram_1.default);
app.use(adminOutbox_1.default);
app.use(adminAudit_1.default);
app.use((req, _res, next) => { (0, tracing_1.runWithSpan)('http.request', () => { }, { path: req.path, method: req.method }); next(); });
app.use(adminTemplates_1.previewTemplatesRouter);
app.use(adminTemplates_1.default);
app.use(adminI18n_1.publicI18nRouter);
app.use(adminI18n_1.default);
app.use(adminSettings_1.default);
// Error envelope
app.use(errorEnvelope_1.errorEnvelope);
// WS: will be attached at /v1/ws in a follow-up scaffold
// Widget delivery: placeholder for /widget.js (served by app or proxy to static build)
app.get('/widget.js', (_req, res) => {
    res.type('application/javascript').send(`(function(){
    var API_BASE = '';
    function http(method, path, body, headers){
      return fetch(API_BASE + path, { method: method, headers: Object.assign({ 'content-type': 'application/json' }, headers||{}), body: body ? JSON.stringify(body) : undefined }).then(function(r){ return r.json(); });
    }
    function showToast(text){ try { var host = document.querySelector('#support-chat-v2'); if (!host) return; var t = document.createElement('div'); t.textContent = text; t.style.cssText='position:absolute;left:50%;transform:translate(-50%,-8px);bottom:64px;background:#000;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;opacity:0.9;'; host.appendChild(t); setTimeout(function(){ try { host.removeChild(t); } catch {} }, 2000); } catch {} }
    function openSocket(token){
      try { var proto = (location.protocol === 'https:') ? 'wss' : 'ws'; var url = proto + '://' + location.host + '/v1/ws?token=' + encodeURIComponent(token); var ws = new WebSocket(url); return ws; } catch (e) { return null; }
    }
    window.SupportChatV2 = {
      init: function init(opts){
        opts = opts || {}; var tenantSlug = opts.tenantSlug || 'default'; var locale = (opts.locale || 'default').toLowerCase(); var name = opts.name || undefined; var theme = opts.theme || {}; var startOpen = !!opts.open;
        return http('POST', '/v1/conversations/start', { name: name, locale: locale }).then(function(start){
          if (!start || !start.token || !start.conversation_id) throw new Error('start_failed');
          return http('POST', '/v2/ws/token', null, { authorization: 'Bearer ' + start.token }).then(function(tok){ return { start: start, wsToken: tok && tok.token }; });
        }).then(function(all){
          var ws = null; var connected = false; var backoffMs = 1000; var maxBackoffMs = 30000;
          function setStatus(text, color){ try { var el = document.querySelector('#scv2_status'); if (el) { el.textContent = text; el.style.color = color || '#6c757d'; } } catch {}
          }
          function attachWsHandlers(sock){
            if (!sock) return;
            sock.onopen = function(){ connected = true; backoffMs = 1000; setStatus('Connected', '#198754'); try { var sb = document.querySelector('#scv2_send'); if (sb) sb.disabled = false; } catch {} };
            sock.onclose = function(){ connected = false; setStatus('Disconnected', '#dc3545'); try { var sb2 = document.querySelector('#scv2_send'); if (sb2) sb2.disabled = true; } catch {};
              setTimeout(function(){
                http('POST', '/v2/ws/token', null, { authorization: 'Bearer ' + all.start.token }).then(function(tok){ if (tok && tok.token){ ws = openSocket(tok.token); attachWsHandlers(ws); } }).catch(function(){});
                backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
              }, backoffMs);
            };
          }
          if (all.wsToken) { ws = openSocket(all.wsToken); attachWsHandlers(ws); }
          function mountUI(){
            var primary = theme.primary || '#0d6efd';
            var bg = theme.background || '#fff';
            var text = theme.text || '#111';
            var border = theme.border || '#ddd';
            var root = document.querySelector('#support-chat-v2');
            if (!root) { root = document.createElement('div'); root.id = 'support-chat-v2'; root.style.cssText='position:fixed;right:16px;bottom:72px;width:280px;max-height:60vh;background:'+bg+';border:1px solid '+border+';border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.2);display:none;flex-direction:column;font-family:system-ui, sans-serif;z-index:2147483647;'; document.body.appendChild(root); }
            root.innerHTML = '<div style="padding:8px;border-bottom:1px solid #eee;font-weight:600;display:flex;align-items:center;justify-content:space-between"><span id="scv2_title">Support</span><span id="scv2_status" style="font-weight:400;font-size:12px;color:#6c757d">Connecting…</span></div><div id="scv2_msgs" style="flex:1;overflow:auto;padding:8px;position:relative"></div><div style="display:flex;border-top:1px solid #eee"><input id="scv2_input" placeholder="Type a message" style="flex:1;border:0;padding:10px;outline:none;background:'+bg+';color:'+text+'"/><button id="scv2_send" style="border:0;background:'+primary+';color:#fff;padding:10px 12px;cursor:pointer" disabled>Send</button></div>';
            var fab = document.querySelector('#scv2_fab');
            if (!fab) { fab = document.createElement('button'); fab.id = 'scv2_fab'; fab.textContent = 'Chat'; fab.setAttribute('aria-label','Open chat'); fab.style.cssText='position:fixed;right:16px;bottom:16px;background:'+primary+';color:#fff;border:0;border-radius:24px;padding:10px 14px;box-shadow:0 6px 20px rgba(0,0,0,0.2);cursor:pointer;font-family:system-ui, sans-serif;z-index:2147483647;'; document.body.appendChild(fab); }
            function toggle(open){ var show = (typeof open==='boolean') ? open : (root.style.display==='none'); root.style.display = show ? 'flex' : 'none'; fab.textContent = show ? 'Close' : 'Chat'; fab.setAttribute('aria-label', show ? 'Close chat' : 'Open chat'); }
            fab.addEventListener('click', function(){ toggle(); });
            toggle(startOpen);
            var msgs = root.querySelector('#scv2_msgs');
            function push(direction, text){ var b = document.createElement('div'); b.textContent = text; b.style.cssText='margin:6px 0;padding:8px 10px;border-radius:12px;max-width:80%;'+(direction==='INBOUND'?'background:#f1f3f5;color:#111;margin-right:auto;':'background:'+primary+';color:#fff;margin-left:auto;'); if (msgs) { msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight; } }
            if (ws) {
              ws.onmessage = function(ev){ try { var m = JSON.parse(String(ev.data)); if (m && m.text && m.direction) push(m.direction, m.text); } catch {} };
            }
            var input = root.querySelector('#scv2_input'); var sendBtn = root.querySelector('#scv2_send');
            function send(){ var t = String((input && (input).value) || '').trim(); if (!t) return; if (sendBtn) (sendBtn).disabled = true; http('POST', '/v1/conversations/' + encodeURIComponent(all.start.conversation_id) + '/messages', { text: t }, { authorization: 'Bearer ' + all.start.token }).then(function(){ push('OUTBOUND',''+t); if (input) (input).value=''; hideTyping(); }).catch(function(){ showToast('Failed to send'); setStatus('Send failed', '#dc3545'); }).finally(function(){ if (sendBtn) (sendBtn).disabled = !connected; }); }
            // Typing indicator (local)
            var typingTimer = null; var typingEl = null;
            function showTyping(){ try { if (!msgs) return; if (typingEl) return; typingEl = document.createElement('div'); typingEl.id='scv2_typing'; typingEl.textContent='…'; typingEl.style.cssText='margin:6px 0;padding:8px 10px;border-radius:12px;max-width:80%;background:#f1f3f5;color:#111;margin-right:auto;opacity:0.7;'; msgs.appendChild(typingEl); msgs.scrollTop = msgs.scrollHeight; } catch {} }
            function hideTyping(){ try { if (typingEl && msgs) { msgs.removeChild(typingEl); typingEl=null; } if (typingTimer) { clearTimeout(typingTimer); typingTimer=null; } } catch {} }
            function scheduleHideTyping(){ if (typingTimer) { clearTimeout(typingTimer); } typingTimer = setTimeout(hideTyping, 1500); }
            if (input) { input.addEventListener('input', function(){ var val = String((input).value||''); if (val.trim().length>0) { showTyping(); scheduleHideTyping(); } else { hideTyping(); } }); }
            if (sendBtn) sendBtn.addEventListener('click', send); if (input) input.addEventListener('keydown', function(e){ if (e && e.key==='Enter') send(); });
            // Load initial history
            http('GET', '/v1/conversations/' + encodeURIComponent(all.start.conversation_id) + '/messages').then(function(hist){ try { var arr = (hist && hist.messages) || []; for (var i=0;i<arr.length;i++){ var m = arr[i]; if (m && m.text && m.direction) push(m.direction, m.text); } } catch {} });
          }
          mountUI();
          return http('GET', '/v1/i18n/' + encodeURIComponent(tenantSlug) + '/' + encodeURIComponent(locale)).then(function(i18n){ try { var entries = (i18n && i18n.entries) || {}; var t = entries['widget.title'] || 'Support'; var ph = entries['widget.input_placeholder'] || 'Type a message'; var sb = entries['widget.send'] || 'Send'; var tEl = document.querySelector('#scv2_title'); if (tEl) tEl.textContent = t; var inEl = document.querySelector('#scv2_input'); if (inEl) inEl.placeholder = ph; var sEl = document.querySelector('#scv2_send'); if (sEl) sEl.textContent = sb; } catch {} return { conversation: all.start, ws: ws, i18n: i18n }; });
        });
      }
    };
  })();`);
});
const server = http_1.default.createServer(app);
(0, server_1.attachWsServer)(server, '/v1/ws');
(0, redisHub_1.startRedisHub)();
server.listen(env_1.CONFIG.port, env_1.CONFIG.bindHost, () => {
    logger_1.logger.info({ event: 'server_listening', port: env_1.CONFIG.port, host: env_1.CONFIG.bindHost });
});
