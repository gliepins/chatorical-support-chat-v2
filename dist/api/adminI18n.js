"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicI18nRouter = void 0;
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
// Upsert translation entry
router.post('/v1/admin/i18n/upsert', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, key, locale, text } = (req.body || {});
        if (!tenantSlug || !key || !locale || !text)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const data = { tenantId: t.id, key, locale: locale.toLowerCase(), text };
        const row = await prisma.messageTemplateLocale.upsert({
            where: { tenantId_key_locale: { tenantId: t.id, key, locale: data.locale } },
            update: data,
            create: data,
        });
        return res.json({ id: row.id });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// Public translations with fallback: exact → 2-letter → default
exports.publicI18nRouter = (0, express_1.Router)();
exports.publicI18nRouter.get('/v1/i18n/:tenantSlug/:locale', async (req, res) => {
    try {
        const slug = req.params.tenantSlug;
        const locale = String(req.params.locale || '').toLowerCase();
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug } });
        if (!t)
            return res.status(404).json({ error: 'tenant_not_found' });
        const locales = [locale];
        if (locale.includes('-'))
            locales.push(locale.split('-')[0]);
        else if (locale.length > 2)
            locales.push(locale.slice(0, 2));
        locales.push('default');
        const rows = await prisma.messageTemplateLocale.findMany({ where: { tenantId: t.id, locale: { in: locales } } });
        // Merge by precedence
        const map = new Map();
        for (let i = locales.length - 1; i >= 0; i--) {
            const lc = locales[i];
            for (const r of rows) {
                if (r.locale === lc)
                    map.set(r.key, r.text);
            }
        }
        return res.json({ locale, entries: Object.fromEntries(map.entries()) });
    }
    catch (e) {
        return res.status(500).json({ error: 'internal_error', detail: e?.message });
    }
});
exports.default = router;
