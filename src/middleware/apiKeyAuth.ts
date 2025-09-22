import { Request, Response, NextFunction } from 'express';
import { verifyApiKey } from '../services/apiKeys';

export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') || req.header('x-api-key') || '';
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7)
    : header;
  if (!token) return next();
  try {
    const rec = await verifyApiKey(token);
    if (rec) {
      (req as any).apiKey = { id: rec.id, tenantId: rec.tenantId, scopes: rec.scopes.split(',').filter(Boolean) };
    }
  } catch {}
  return next();
}


