import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../telemetry/logger';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const existing = req.header('x-request-id');
  const id = existing && existing.trim() ? existing.trim() : randomUUID();
  (req as any).requestId = id;
  try { (logger as any).bindings = () => ({ request_id: id }); } catch {}
  res.setHeader('x-request-id', id);
  return next();
}


