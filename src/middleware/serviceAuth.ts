import { Request, Response, NextFunction } from 'express';
import { CONFIG } from '../config/env';
import fs from 'fs';

function readS2SToken(): string | null {
  try {
    if (CONFIG.s2sToken) return CONFIG.s2sToken;
  } catch {}
  try {
    const p = process.env.S2S_TOKEN_FILE;
    if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  } catch {}
  return null;
}

export function requireServiceAuth(req: Request, res: Response, next: NextFunction) {
  const provided = req.header('x-internal-auth');
  const token = readS2SToken();
  if (!token || !provided || provided !== token) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'missing_or_invalid_service_token' } });
  }
  return next();
}


export function isServiceAuthenticated(req: Request): boolean {
  try {
    const provided = req.header('x-internal-auth');
    const token = readS2SToken();
    return !!token && !!provided && provided === token;
  } catch {
    return false;
  }
}

/**
 * Allows either internal service token OR API key with required scopes.
 * If no credentials are present → 401. If API key present but lacks scopes → 403.
 */
export function requireServiceOrApiKey(requiredScopes: string[] = []) {
  const needed = Array.isArray(requiredScopes) ? requiredScopes.filter(Boolean) : [];
  return (req: Request, res: Response, next: NextFunction) => {
    // Service token bypass (legacy admin)
    if (isServiceAuthenticated(req)) return next();

    // API key scopes path
    const apiKey = (req as any).apiKey as { id: string; tenantId: string; scopes: string[] } | undefined;
    if (!apiKey) {
      return res.status(401).json({ error: { code: 'unauthorized', message: 'api_key_required' } });
    }
    const have = new Set((apiKey.scopes || []).map((s) => s.trim()).filter(Boolean));
    const missing = needed.filter((s) => !have.has(s));
    if (missing.length > 0) {
      return res.status(403).json({ error: { code: 'insufficient_scope', message: 'missing_scopes', details: { required: needed, missing } } as any });
    }
    return next();
  };
}


