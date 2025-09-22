import { Router } from 'express';
import { requireServiceOrApiKey } from '../middleware/serviceAuth';
import { getPrisma } from '../db/client';

const router = Router();

// Upsert translation entry
router.post('/v1/admin/i18n/upsert', requireServiceOrApiKey(['admin:write']), async (req, res) => {
  try {
    const { tenantSlug, key, locale, text } = (req.body || {}) as { tenantSlug?: string; key?: string; locale?: string; text?: string };
    if (!tenantSlug || !key || !locale || !text) return res.status(400).json({ error: { code: 'missing_params' } });
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!t) return res.status(404).json({ error: { code: 'tenant_not_found' } });
    const apiKey = (req as any).apiKey as { tenantId: string } | undefined;
    if (apiKey && apiKey.tenantId !== t.id) return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
    const data: any = { tenantId: t.id, key, locale: locale.toLowerCase(), text };
    const row = await (prisma as any).messageTemplateLocale.upsert({ // reuse same table for simplicity
      where: { tenantId_key_locale: { tenantId: t.id, key, locale: data.locale } },
      update: data,
      create: data,
    });
    return res.json({ id: row.id });
  } catch (e: any) {
    return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
  }
});

// Public translations with fallback: exact → 2-letter → default
export const publicI18nRouter = Router();
publicI18nRouter.get('/v1/i18n/:tenantSlug/:locale', async (req, res) => {
  try {
    const slug = req.params.tenantSlug;
    const locale = String(req.params.locale || '').toLowerCase();
    const prisma = getPrisma();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const locales = [locale];
    if (locale.includes('-')) locales.push(locale.split('-')[0]); else if (locale.length > 2) locales.push(locale.slice(0,2));
    locales.push('default');
    const rows = await (prisma as any).messageTemplateLocale.findMany({ where: { tenantId: t.id, locale: { in: locales } } });
    // Merge by precedence
    const map = new Map<string, string>();
    for (let i = locales.length - 1; i >= 0; i--) {
      const lc = locales[i];
      for (const r of rows) {
        if (r.locale === lc) map.set(r.key, r.text);
      }
    }
    return res.json({ locale, entries: Object.fromEntries(map.entries()) });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message });
  }
});

export default router;


