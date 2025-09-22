import { Request, Response, NextFunction } from 'express';
import { verifyConversationToken, hashIp } from '../services/auth';

export function requireConversationAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7)
    : '';
  if (!token) return res.status(401).json({ error: { code: 'unauthorized', message: 'missing_token' } });
  try {
    const ipHash = hashIp((req.ip || '').toString());
    const parsed = verifyConversationToken(token, ipHash);
    (req as any).conversation = parsed;
    const paramId = (req.params as any).id;
    if (paramId && parsed.conversationId !== paramId) {
      return res.status(403).json({ error: { code: 'forbidden', message: 'conversation_mismatch' } });
    }
    return next();
  } catch {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'invalid_token' } });
  }
}


