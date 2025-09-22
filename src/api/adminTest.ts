import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { createConversationWithThread, findOrCreateRootConversation, addAgentOutboundMessage } from '../repositories/conversationRepo';

const router = Router();

// POST /v1/admin/test/persist { tenantSlug: string, threadId?: number, text: string }
router.post('/v1/admin/test/persist', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, threadId, text } = (req.body || {}) as { tenantSlug?: string; threadId?: number; text?: string };
    if (!tenantSlug || typeof tenantSlug !== 'string') return res.status(400).json({ error: { code: 'tenantSlug_required' } });
    if (!text || typeof text !== 'string') return res.status(400).json({ error: { code: 'text_required' } });
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    let conv: any;
    if (typeof threadId === 'number' && Number.isFinite(threadId)) {
      conv = await prisma.conversation.findFirst({ where: { tenantId: tenant.id, threadId } });
      if (!conv) conv = await createConversationWithThread(tenant.id, threadId, `Test for ${tenantSlug}`);
    } else {
      conv = await findOrCreateRootConversation(tenant.id, `Root for ${tenantSlug}`);
    }
    const msg = await addAgentOutboundMessage(tenant.id, conv.id, text);
    return res.json({ conversation: { id: conv.id, threadId: conv.threadId, codename: conv.codename }, message: msg });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;


