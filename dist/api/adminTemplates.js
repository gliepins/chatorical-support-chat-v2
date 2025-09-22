"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewTemplatesRouter = void 0;
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const templates_1 = require("../services/templates");
const router = (0, express_1.Router)();
// POST /v1/admin/templates/upsert { tenantSlug, key, locale?, text, flags? }
router.post('/v1/admin/templates/upsert', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, key, locale, text, flags } = (req.body || {});
        if (!tenantSlug || !key || !text)
            return res.status(400).json({ error: { code: 'missing_params' } });
        const l = (locale || 'default').toLowerCase();
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const data = {
            tenantId: t.id,
            key,
            locale: l,
            text,
            ...(flags || {}),
        };
        const row = await prisma.messageTemplateLocale.upsert({
            where: { tenantId_key_locale: { tenantId: t.id, key, locale: l } },
            update: data,
            create: data,
        });
        return res.json({ id: row.id, key: row.key, locale: row.locale });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// GET /v1/admin/templates/:tenantSlug?locale=xx
router.get('/v1/admin/templates/:tenantSlug', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:read']), async (req, res) => {
    try {
        const slug = req.params.tenantSlug;
        const locale = String(req.query.locale || '');
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const where = { tenantId: t.id };
        if (locale)
            where.locale = locale.toLowerCase();
        const rows = await prisma.messageTemplateLocale.findMany({ where, orderBy: { key: 'asc' } });
        return res.json({ templates: rows.map((r) => ({ key: r.key, locale: r.locale, text: r.text })) });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// DELETE /v1/admin/templates/:tenantSlug/:key/:locale
router.delete('/v1/admin/templates/:tenantSlug/:key/:locale', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, key, locale } = req.params;
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        await prisma.messageTemplateLocale.delete({ where: { tenantId_key_locale: { tenantId: t.id, key, locale: locale.toLowerCase() } } });
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
// Preview endpoint (no auth for simplicity could be protected if needed)
exports.previewTemplatesRouter = (0, express_1.Router)();
exports.previewTemplatesRouter.get('/v1/admin/templates/:tenantSlug/preview/:key', async (req, res) => {
    try {
        const slug = req.params.tenantSlug;
        const key = req.params.key;
        const locale = String(req.query.locale || '');
        const vars = req.query.vars ? JSON.parse(String(req.query.vars)) : {};
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug } });
        if (!t)
            return res.status(404).json({ error: 'tenant_not_found' });
        const text = await (0, templates_1.resolveTemplateText)(t.id, key, locale);
        if (!text)
            return res.status(404).json({ error: 'template_not_found' });
        const rendered = (0, templates_1.renderTemplate)(text, vars);
        return res.json({ rendered });
    }
    catch (e) {
        return res.status(500).json({ error: 'internal_error', detail: e?.message });
    }
});
