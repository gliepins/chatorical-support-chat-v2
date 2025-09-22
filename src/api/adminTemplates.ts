import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';
import { resolveTemplateText, renderTemplate } from '../services/templates';

const router = Router();

// POST /v1/admin/templates/upsert { tenantSlug, key, locale?, text, flags? }
router.post('/v1/admin/templates/upsert', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, key, locale, text, flags } = (req.body || {}) as { tenantSlug?: string; key?: string; locale?: string; text?: string; flags?: any };
    if (!tenantSlug || !key || !text) return res.status(400).json({ error: { code: 'missing_params' } });
    const l = (locale || 'default').toLowerCase();
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const data: any = {
      tenantId: t.id,
      key,
      locale: l,
      text,
      ...(flags || {}),
    };
    const row = await (prisma as any).messageTemplateLocale.upsert({
      where: { tenantId_key_locale: { tenantId: t.id, key, locale: l } },
      update: data,
      create: data,
    });
    return res.json({ id: row.id, key: row.key, locale: row.locale });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// GET /v1/admin/templates/:tenantSlug?locale=xx
router.get('/v1/admin/templates/:tenantSlug', requireServiceOrApiKey(['admin:read']), async (req, res) => {
  try {
    const slug = req.params.tenantSlug;
    const locale = String((req.query as any).locale || '');
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const where: any = { tenantId: t.id };
    if (locale) where.locale = locale.toLowerCase();
    const rows = await (prisma as any).messageTemplateLocale.findMany({ where, orderBy: { key: 'asc' } });
    return res.json({ templates: rows.map((r: any) => ({ key: r.key, locale: r.locale, text: r.text })) });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// DELETE /v1/admin/templates/:tenantSlug/:key/:locale
router.delete('/v1/admin/templates/:tenantSlug/:key/:locale', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, key, locale } = req.params as any;
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    await (prisma as any).messageTemplateLocale.delete({ where: { tenantId_key_locale: { tenantId: t.id, key, locale: locale.toLowerCase() } } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

export default router;

// Preview endpoint (no auth for simplicity could be protected if needed)
export const previewTemplatesRouter = Router();
previewTemplatesRouter.get('/v1/admin/templates/:tenantSlug/preview/:key', async (req, res) => {
  try {
    const slug = req.params.tenantSlug;
    const key = req.params.key;
    const locale = String((req.query as any).locale || '');
    const vars = (req.query as any).vars ? JSON.parse(String((req.query as any).vars)) : {};
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const text = await resolveTemplateText(t.id, key, locale);
    if (!text) return res.status(404).json({ error: 'template_not_found' });
    const rendered = renderTemplate(text, vars);
    return res.json({ rendered });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});


