import { Request, Response, NextFunction } from 'express';

export function errorEnvelope(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    if (req.path.startsWith('/v1/telegram/webhook/')) {
      return res.json({ ok: true });
    }
  }
  const status = err?.statusCode || 500;
  const code = err?.code || 'internal_error';
  const message = err?.message || 'Something went wrong';
  return res.status(status).json({ error: { code, message } });
}


