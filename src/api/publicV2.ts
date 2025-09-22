import { Router } from 'express';
import { requireConversationAuth } from '../middleware/conversationAuth';
import { hashIp, signConversationToken } from '../services/auth';

const router = Router();

// Issue a short-lived WS token based on a valid conversation JWT
// POST /v2/ws/token
router.post('/v2/ws/token', requireConversationAuth, async (req, res) => {
  try {
    const tenantId: string = (req as any).conversation?.tenantId;
    const conversationId: string = (req as any).conversation?.conversationId;
    if (!tenantId || !conversationId) return res.status(401).json({ error: { code: 'unauthorized' } });
    const ipHash = hashIp((req.ip || '').toString());
    const ttl = 60; // seconds
    const token = signConversationToken(tenantId, conversationId, ipHash, ttl);
    return res.json({ token, expires_in: ttl });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;


