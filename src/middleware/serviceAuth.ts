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
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}


