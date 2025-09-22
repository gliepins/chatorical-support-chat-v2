type SpanLike = { end: (endTime?: number) => void; setAttribute: (k: string, v: unknown) => void; recordException: (e: unknown) => void };

let otel: any = null;
try { otel = require('@opentelemetry/api'); } catch {}

function nowHr(): number { return Date.now(); }

class NoopSpan implements SpanLike {
  end(): void {}
  setAttribute(): void {}
  recordException(): void {}
}

export function startSpan(name: string, attributes?: Record<string, unknown>): SpanLike {
  if (otel && otel.trace && typeof otel.trace.getTracer === 'function') {
    try {
      const tracer = otel.trace.getTracer('support-chat-v2');
      const span = tracer.startSpan(name);
      if (attributes) {
        for (const [k, v] of Object.entries(attributes)) try { span.setAttribute(k, v as any); } catch {}
      }
      return {
        end: () => span.end(),
        setAttribute: (k, v) => { try { span.setAttribute(k, v as any); } catch {} },
        recordException: (e) => { try { span.recordException(e as any); } catch {} },
      };
    } catch {}
  }
  const s = new NoopSpan();
  if (attributes) { /* ignore */ }
  return s;
}

export function runWithSpan<T>(name: string, fn: () => Promise<T>, attributes?: Record<string, unknown>): Promise<T>;
export function runWithSpan<T>(name: string, fn: () => T, attributes?: Record<string, unknown>): T;
export function runWithSpan<T>(name: string, fn: any, attributes?: Record<string, unknown>): any {
  const span = startSpan(name, attributes);
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then((v: any) => { span.end(nowHr()); return v; }).catch((e: any) => { try { span.recordException(e); } catch {} span.end(nowHr()); throw e; });
    }
    span.end(nowHr());
    return res;
  } catch (e) {
    try { span.recordException(e); } catch {}
    span.end(nowHr());
    throw e;
  }
}


