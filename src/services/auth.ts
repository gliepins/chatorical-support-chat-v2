import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config/env';

export function hashIp(ipAddress: string): string {
  return crypto.createHash('sha256').update(ipAddress).digest('hex');
}

function getJwtSecret(): string {
  const s = CONFIG.jwtSecret;
  if (!s || s.length < 16) {
    throw new Error('Missing or weak CONVERSATION_JWT_SECRET');
  }
  return s;
}

export function signConversationToken(tenantId: string, conversationId: string, ipHash: string, ttlSeconds = 3600): string {
  const secret = getJwtSecret();
  const payload: any = { t: tenantId, sub: conversationId };
  const unbind = String(process.env.UNBIND_JWT_FROM_IP || '').toLowerCase() === 'true';
  if (!unbind) payload.ip = ipHash;
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
}

export function verifyConversationToken(token: string, ipHash: string): { tenantId: string; conversationId: string } {
  const secret = getJwtSecret();
  const payload = jwt.verify(token, secret) as any;
  if (!payload || typeof payload.sub !== 'string' || typeof payload.t !== 'string') {
    throw new Error('Invalid token payload');
  }
  if (typeof payload.ip === 'string') {
    if (!ipHash || payload.ip !== ipHash) {
      throw new Error('IP mismatch');
    }
  }
  return { tenantId: payload.t, conversationId: payload.sub };
}


