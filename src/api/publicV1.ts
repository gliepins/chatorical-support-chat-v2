import { Router } from 'express';
import { hashIp, signConversationToken } from '../services/auth';
import { dynamicIpRateLimit } from '../middleware/rateLimit';
import { createConversation, listMessages, getConversationById } from '../repositories/conversationRepo';

const router = Router();

const START_POINTS = Number(process.env.START_IP_POINTS || 20);
const START_DURATION = Number(process.env.START_IP_DURATION_SEC || 60);

router.post('/v1/conversations/start', dynamicIpRateLimit('start', START_POINTS, START_DURATION), async (req, res) => {
  try {
    const { name, locale } = (req.body || {}) as { name?: string; locale?: string };
    const tenantId: string = (req as any).tenant?.tenantId || 'default';
    const conv = await createConversation(tenantId, name, locale);
    const ipHash = hashIp((req.ip || '').toString());
    const token = signConversationToken(tenantId, conv.id, ipHash);
    return res.json({ conversation_id: conv.id, token, codename: conv.codename });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'bad request' });
  }
});

router.get('/v1/conversations/:id/messages', async (req, res) => {
  try {
    const tenantId: string = (req as any).tenant?.tenantId || 'default';
    const conv = await getConversationById(tenantId, req.params.id);
    if (!conv) return res.status(404).json({ error: 'not_found' });
    const msgs = await listMessages(tenantId, req.params.id);
    return res.json({ status: 'OPEN_UNCLAIMED', messages: msgs });
  } catch (e: any) {
    return res.status(400).json({ error: 'bad request' });
  }
});

export default router;


