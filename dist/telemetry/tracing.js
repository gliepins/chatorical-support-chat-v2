"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSpan = startSpan;
exports.runWithSpan = runWithSpan;
let otel = null;
try {
    otel = require('@opentelemetry/api');
}
catch { }
function nowHr() { return Date.now(); }
class NoopSpan {
    end() { }
    setAttribute() { }
    recordException() { }
}
function startSpan(name, attributes) {
    if (otel && otel.trace && typeof otel.trace.getTracer === 'function') {
        try {
            const tracer = otel.trace.getTracer('support-chat-v2');
            const span = tracer.startSpan(name);
            if (attributes) {
                for (const [k, v] of Object.entries(attributes))
                    try {
                        span.setAttribute(k, v);
                    }
                    catch { }
            }
            return {
                end: () => span.end(),
                setAttribute: (k, v) => { try {
                    span.setAttribute(k, v);
                }
                catch { } },
                recordException: (e) => { try {
                    span.recordException(e);
                }
                catch { } },
            };
        }
        catch { }
    }
    const s = new NoopSpan();
    if (attributes) { /* ignore */ }
    return s;
}
function runWithSpan(name, fn, attributes) {
    const span = startSpan(name, attributes);
    try {
        const res = fn();
        if (res && typeof res.then === 'function') {
            return res.then((v) => { span.end(nowHr()); return v; }).catch((e) => { try {
                span.recordException(e);
            }
            catch { } span.end(nowHr()); throw e; });
        }
        span.end(nowHr());
        return res;
    }
    catch (e) {
        try {
            span.recordException(e);
        }
        catch { }
        span.end(nowHr());
        throw e;
    }
}
