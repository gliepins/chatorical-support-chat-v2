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
const adminBilling_1 = __importDefault(require("./api/adminBilling"));
const stripeWebhook_1 = require("./api/stripeWebhook");
const adminPlans_1 = __importDefault(require("./api/adminPlans"));
const metrics_1 = require("./telemetry/metrics");
const redisHub_1 = require("./ws/redisHub");
const apiKeyAuth_1 = require("./middleware/apiKeyAuth");
const errorEnvelope_1 = require("./middleware/errorEnvelope");
const tracing_1 = require("./telemetry/tracing");
const app = (0, express_1.default)();
app.set('trust proxy', true);
// Stripe webhook must receive raw body before JSON parsing
app.use((0, stripeWebhook_1.stripeWebhookRouter)());
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
app.use(adminBilling_1.default);
app.use(adminPlans_1.default);
app.use((0, stripeWebhook_1.stripeWebhookRouter)());
// Error envelope
app.use(errorEnvelope_1.errorEnvelope);
// WS: will be attached at /v1/ws in a follow-up scaffold
// Widget delivery: inline script. Versioned (?v=...) → long immutable cache; else short TTL
app.get('/widget.js', (req, res) => {
    try {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    catch { }
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    catch { }
    res.type('application/javascript');
    var version = '';
    try {
        version = (req.query && req.query.v) ? String(req.query.v) : '';
    }
    catch { }
    if (version) {
        try {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        catch { }
    }
    else {
        try {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
        catch { }
    }
    res.send(`(function(){
    var API_BASE = '';
    var WS_BASE = '';
    var LS_OPEN = 'scv2_open';
    var LS_DRAFT = 'scv2_draft';
    var LS_UNREAD = 'scv2_unread';
    var LS_LAST = 'scv2_last_seen_ms';
    var LS_CONV = 'scv2_conv';
    var LS_TOKEN = 'scv2_token';
    function http(method, path, body, headers){
      return fetch(API_BASE + path, { method: method, headers: Object.assign({ 'content-type': 'application/json' }, headers||{}), body: body ? JSON.stringify(body) : undefined }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(b){
          if (!r.ok) {
            var err = new Error((b && b.error && (b.error.message||b.error.code)) || 'error');
            err.code = (b && b.error && b.error.code) || String(r.status);
            throw err;
          }
          return b;
        });
      });
    }
    function showToast(text){ try { var host = document.querySelector('#support-chat-v2'); if (!host) return; var t = document.createElement('div'); t.textContent = text; t.style.cssText='position:absolute;left:50%;transform:translate(-50%,-8px);bottom:64px;background:#000;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;opacity:0.9;'; host.appendChild(t); setTimeout(function(){ try { host.removeChild(t); } catch {} }, 2000); } catch {} }
    function openSocket(token){
      try { var url = WS_BASE + '/v1/ws?token=' + encodeURIComponent(token); var ws = new WebSocket(url); return ws; } catch (e) { return null; }
    }
    window.SupportChatV2 = {
      init: function init(opts){
        opts = opts || {};
        var tenantSlug = opts.tenantSlug || 'default';
        var locale = (opts.locale || 'default').toLowerCase();
        var name = opts.name || undefined;
        var theme = opts.theme || {};
        var position = (opts.position === 'left') ? 'left' : 'right';
        (function configureOrigin(){
          var origin = opts.origin || opts.apiBase || '';
          if (origin) {
            try {
              var u = new URL(origin);
              API_BASE = u.origin;
              WS_BASE = (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host;
            } catch (_e) {
              API_BASE = String(origin);
              try { while (API_BASE.length > 0 && API_BASE.charCodeAt(API_BASE.length - 1) === 47) { API_BASE = API_BASE.slice(0, -1); } } catch {}
              WS_BASE = ((location.protocol === 'https:') ? 'wss://' : 'ws://') + location.host;
            }
          } else {
            API_BASE = '';
            WS_BASE = ((location.protocol === 'https:') ? 'wss://' : 'ws://') + location.host;
          }
        })();
        var startOpen = (function(){ try { var so = localStorage.getItem(LS_OPEN); if (so === '1') return true; if (so === '0') return false; } catch(_e) {} return !!opts.open; })();
        function begin(){
          var storedConv = null; var storedTok = null;
          try { storedConv = localStorage.getItem(LS_CONV)||''; storedTok = localStorage.getItem(LS_TOKEN)||''; } catch(_e) {}
          var startPromise;
          if (storedConv && storedTok) {
            startPromise = Promise.resolve({ token: storedTok, conversation_id: storedConv });
          } else {
            startPromise = http('POST', '/v1/conversations/start', { name: name, locale: locale });
          }
          return startPromise.then(function(start){
            if (!start || !start.token || !start.conversation_id) throw new Error('start_failed');
            try { localStorage.setItem(LS_CONV, start.conversation_id); localStorage.setItem(LS_TOKEN, start.token); } catch(_e) {}
            return http('POST', '/v2/ws/token', null, { authorization: 'Bearer ' + start.token }).then(function(tok){ return { start: start, wsToken: tok && tok.token }; });
          }).catch(function(){
            // Fallback: force new conversation on failure
            return http('POST', '/v1/conversations/start', { name: name, locale: locale }).then(function(start){
              if (!start || !start.token || !start.conversation_id) throw new Error('start_failed');
              try { localStorage.setItem(LS_CONV, start.conversation_id); localStorage.setItem(LS_TOKEN, start.token); } catch(_e) {}
              return http('POST', '/v2/ws/token', null, { authorization: 'Bearer ' + start.token }).then(function(tok){ return { start: start, wsToken: tok && tok.token }; });
            });
          });
        }
        return begin().then(function(all){
          var ws = null; var connected = false; var backoffMs = 1000; var maxBackoffMs = 30000; var queue = []; var flushing = false; var lastSeenMs = 0; var hasConnectedOnce = false; var seen = Object.create(null); try { var ls = localStorage.getItem(LS_LAST); lastSeenMs = Math.max(0, parseInt(ls||'0',10)||0); } catch(_e) {}
          function setStatus(text, color){ try { var el = document.querySelector('#scv2_status'); if (el) { el.textContent = text; el.style.color = color || '#6c757d'; } } catch {} }
          function refreshWsToken(){ return http('POST', '/v2/ws/token', null, { authorization: 'Bearer ' + all.start.token }).then(function(tok){ return tok && tok.token; }).catch(function(){
            // Fallback: token likely stale; start a fresh conversation and update storage
            return http('POST', '/v1/conversations/start', { name: name, locale: locale }).then(function(ns){
              try { localStorage.setItem(LS_CONV, ns.conversation_id); localStorage.setItem(LS_TOKEN, ns.token); } catch(_e) {}
              all.start = ns;
              return http('POST', '/v2/ws/token', null, { authorization: 'Bearer ' + ns.token }).then(function(tok2){ return tok2 && tok2.token; });
            });
          }); }
          function tryReconnect(){ setStatus('Reconnecting…', '#fd7e14'); setTimeout(function(){ refreshWsToken().then(function(t){ if (t){ ws = openSocket(t); attachWsHandlers(ws); } }).catch(function(){ /* ignore */ }); backoffMs = Math.min(backoffMs * 2, maxBackoffMs); }, backoffMs + Math.floor(Math.random()*300)); }
          function flushQueue(){ if (flushing) return; flushing = true; (function run(){ if (!connected || queue.length === 0) { flushing = false; return; } var next = queue.shift(); sendImpl(next.text, true).finally(run); })(); }
          function backfillSince(){ try { var qs = lastSeenMs>0 ? ('?since=' + encodeURIComponent(String(lastSeenMs))) : ''; http('GET', '/v1/conversations/' + encodeURIComponent(all.start.conversation_id) + '/messages' + qs).then(function(hist){ try { var arr = (hist && hist.messages) || []; for (var i=0;i<arr.length;i++){ var m = arr[i]; if (m && m.text && m.direction) push(m.direction, m.text, m.createdAt, (m.direction==='INBOUND'?'You':'Support')); } } catch {} }); } catch {} }
          function attachWsHandlers(sock){
            if (!sock) return;
            sock.onopen = function(){ connected = true; backoffMs = 1000; setStatus('Connected', '#198754'); try { var sb = document.querySelector('#scv2_send'); if (sb) sb.disabled = false; } catch {} try { if (hasConnectedOnce) { backfillSince(); } } catch {} flushQueue(); hasConnectedOnce = true; };
            sock.onclose = function(){ connected = false; setStatus('Disconnected', '#dc3545'); try { var sb2 = document.querySelector('#scv2_send'); if (sb2) sb2.disabled = true; } catch {}; tryReconnect(); };
          }
          if (all.wsToken) { ws = openSocket(all.wsToken); attachWsHandlers(ws); }
          function mountUI(){
            var primary = theme.primary || '#0d6efd';
            var bg = theme.background || '#fff';
            var text = theme.text || '#111';
            var border = theme.border || '#ddd';
            var root = document.querySelector('#support-chat-v2');
            if (!root) { root = document.createElement('div'); root.id = 'support-chat-v2'; root.style.cssText='position:fixed;bottom:72px;width:280px;max-height:60vh;background:'+bg+';border:1px solid '+border+';border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.2);display:none;flex-direction:column;font-family:system-ui, sans-serif;z-index:2147483647;'; if (position==='left') { root.style.left='16px'; } else { root.style.right='16px'; } document.body.appendChild(root); }
            try { root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-labelledby','scv2_title'); } catch {}
            root.innerHTML = '<div style="padding:8px;border-bottom:1px solid #eee;font-weight:600;display:flex;align-items:center;justify-content:space-between"><span id="scv2_title">Support</span><div style="display:flex;align-items:center;gap:8px"><button id="scv2_clear" aria-label="Clear conversation" title="Clear" style="border:0;background:transparent;color:'+text+';cursor:pointer;font-size:12px">Clear</button><span id="scv2_status" aria-live="polite" style="font-weight:400;font-size:12px;color:#6c757d">Connecting…</span></div></div><div id="scv2_msgs" style="flex:1;overflow:auto;padding:8px;position:relative"></div><div style="display:flex;border-top:1px solid #eee"><input id="scv2_input" placeholder="Type a message" style="flex:1;border:0;padding:10px;outline:none;background:'+bg+';color:'+text+'"/><button id="scv2_send" aria-label="Send message" style="border:0;background:'+primary+';color:#fff;padding:10px 12px;cursor:pointer" disabled>Send</button></div>';
            var fab = document.querySelector('#scv2_fab');
            if (!fab) { fab = document.createElement('button'); fab.id = 'scv2_fab'; fab.textContent = 'Chat'; fab.setAttribute('aria-label','Open chat'); fab.style.cssText='position:fixed;bottom:16px;background:'+primary+';color:#fff;border:0;border-radius:24px;padding:10px 14px;box-shadow:0 6px 20px rgba(0,0,0,0.2);cursor:pointer;font-family:system-ui, sans-serif;z-index:2147483647;'; if (position==='left') { fab.style.left='16px'; } else { fab.style.right='16px'; } document.body.appendChild(fab); }
            var badge = document.querySelector('#scv2_badge');
            if (!badge) { badge = document.createElement('span'); badge.id='scv2_badge'; badge.style.cssText='position:absolute;top:-6px;right:-6px;background:#dc3545;color:#fff;border-radius:10px;padding:0 6px;min-width:18px;height:18px;line-height:18px;font-size:11px;text-align:center;display:none;'; fab.appendChild(badge); }
            var unread = 0; try { var ustr = localStorage.getItem(LS_UNREAD); unread = Math.max(0, parseInt(ustr||'0',10)||0); } catch(_e) {}
            function setUnread(n){ unread = n; if (badge) { badge.textContent = String(unread); badge.style.display = unread>0 ? 'inline-block' : 'none'; } try { localStorage.setItem(LS_UNREAD, String(unread)); } catch(_e) {} }
            var lastFocus = null;
            function toggle(open){ var show = (typeof open==='boolean') ? open : (root.style.display==='none'); if (show) { lastFocus = document.activeElement; } root.style.display = show ? 'flex' : 'none'; fab.textContent = show ? 'Close' : 'Chat'; fab.setAttribute('aria-label', show ? 'Close chat' : 'Open chat'); try { localStorage.setItem(LS_OPEN, show ? '1' : '0'); } catch(_e) {} if (show) { setUnread(0); try { var inEl2 = root.querySelector('#scv2_input'); if (inEl2) (inEl2).focus(); } catch {} } else { try { (fab).focus(); } catch {} } }
            fab.addEventListener('click', function(){ toggle(); });
            toggle(startOpen);
            var msgs = root.querySelector('#scv2_msgs');
            function fmtTime(iso){ try { var d = new Date(iso); if (!isFinite(d.getTime())) return ''; return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch(_) { return ''; } }
            function push(direction, text, createdAt, agent){ var ts = (function(){ try { var d = new Date(createdAt||Date.now()); if (!isFinite(d.getTime())) return Date.now(); return d.getTime(); } catch(_) { return Date.now(); } })(); var key = String(direction)+'|'+String(ts)+'|'+String(text); if (seen[key]) { return; } seen[key] = 1; if (ts > lastSeenMs) { lastSeenMs = ts; try { localStorage.setItem(LS_LAST, String(lastSeenMs)); } catch(_e) {} } var wrap = document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;'+(direction==='INBOUND'?'align-items:flex-end;':'align-items:flex-start;'); var meta = document.createElement('div'); meta.style.cssText='font-size:10px;color:#6c757d;margin:2px 4px;'; var time = fmtTime(ts); var who = (direction==='INBOUND') ? 'You' : (agent || 'Support'); meta.textContent = (who ? (who + ' · ') : '') + time; var b = document.createElement('div'); b.textContent = text; b.style.cssText='margin:2px 0;padding:8px 10px;border-radius:12px;max-width:80%;word-break:break-word;'+(direction==='INBOUND'?'background:'+primary+';color:#fff;margin-left:auto;':'background:#f1f3f5;color:#111;margin-right:auto;'); wrap.appendChild(meta); wrap.appendChild(b); if (msgs) { msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight; } }
            if (ws) {
              ws.onmessage = function(ev){ try { var m = JSON.parse(String(ev.data)); if (m && m.text && m.direction) { push(m.direction, m.text, (m.createdAt||Date.now()), (m.agent||'Support')); if (m.direction==='OUTBOUND' && root && root.style.display==='none') { setUnread(unread + 1); } } } catch {} };
            }
            var input = root.querySelector('#scv2_input'); var sendBtn = root.querySelector('#scv2_send');
            try { var savedDraft = localStorage.getItem(LS_DRAFT); if (savedDraft && input) { (input).value = savedDraft; } } catch(_e) {}
            function sendImpl(textToSend, isFlush){ return http('POST', '/v1/conversations/' + encodeURIComponent(all.start.conversation_id) + '/messages', { text: textToSend }, { authorization: 'Bearer ' + all.start.token }).then(function(){ push('INBOUND',''+textToSend, new Date().toISOString(), 'You'); if (!isFlush && input) { (input).value=''; try { localStorage.setItem(LS_DRAFT, ''); } catch(_e) {} } hideTyping(); }).catch(function(err){ if (err && err.code === 'over_limit') { showToast('Daily limit reached'); setStatus('Over limit', '#dc3545'); } else { showToast('Failed to send'); setStatus('Send failed', '#dc3545'); } }); }
            function send(){ var t = String((input && (input).value) || '').trim(); if (!t) return; if (!connected) { queue.push({ text: t }); showToast('Queued (offline)'); if (input) (input).value=''; return; } if (sendBtn) (sendBtn).disabled = true; sendImpl(t, false).finally(function(){ if (sendBtn) (sendBtn).disabled = !connected; }); }
            // Typing indicator (local)
            var typingTimer = null; var typingEl = null;
            function showTyping(){ try { if (!msgs) return; if (typingEl) return; typingEl = document.createElement('div'); typingEl.id='scv2_typing'; typingEl.textContent='…'; typingEl.style.cssText='margin:6px 0;padding:8px 10px;border-radius:12px;max-width:80%;background:#f1f3f5;color:#111;margin-right:auto;opacity:0.7;'; msgs.appendChild(typingEl); msgs.scrollTop = msgs.scrollHeight; } catch {} }
            function hideTyping(){ try { if (typingEl && msgs) { msgs.removeChild(typingEl); typingEl=null; } if (typingTimer) { clearTimeout(typingTimer); typingTimer=null; } } catch {} }
            function scheduleHideTyping(){ if (typingTimer) { clearTimeout(typingTimer); } typingTimer = setTimeout(hideTyping, 1500); }
            if (input) { input.addEventListener('input', function(){ var val = String((input).value||''); if (val.trim().length>0) { showTyping(); scheduleHideTyping(); } else { hideTyping(); } try { localStorage.setItem(LS_DRAFT, String((input).value||'')); } catch(_e) {} }); }
            if (sendBtn) sendBtn.addEventListener('click', send); if (input) input.addEventListener('keydown', function(e){ if (e && e.key==='Enter') send(); });
            // Load initial history once; subsequent reconnects rely on backfillSince()
            http('GET', '/v1/conversations/' + encodeURIComponent(all.start.conversation_id) + '/messages').then(function(hist){ try { var arr = (hist && hist.messages) || []; for (var i=0;i<arr.length;i++){ var m = arr[i]; if (m && m.text && m.direction) push(m.direction, m.text, m.createdAt, (m.direction==='OUTBOUND'?'Support': 'You')); } } catch {} });
            // Online/offline
            try { window.addEventListener('online', function(){ setStatus(connected ? 'Connected' : 'Reconnecting…', connected ? '#198754' : '#fd7e14'); if (!connected) tryReconnect(); }); window.addEventListener('offline', function(){ setStatus('Offline', '#6c757d'); }); } catch {}
            setUnread(unread);
            try { var clearBtn = document.querySelector('#scv2_clear'); if (clearBtn) clearBtn.addEventListener('click', function(){ try { localStorage.removeItem(LS_DRAFT); localStorage.setItem(LS_UNREAD, '0'); } catch {}; try { if (msgs) msgs.innerHTML=''; } catch {}; setUnread(0); showToast('Cleared'); }); } catch {}
            try { window.addEventListener('keydown', function(e){ if (!e) return; if (e.key === 'Escape' && root && root.style.display==='flex') { toggle(false); } }); } catch {}
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
