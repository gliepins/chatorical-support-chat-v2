"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const apiKeys_1 = require("../services/apiKeys");
const router = (0, express_1.Router)();
// POST /v1/admin/keys/issue { tenantSlug, name, scopes[] }
router.post('/v1/admin/keys/issue', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const { tenantSlug, name, scopes } = (req.body || {});
        if (!tenantSlug || !name)
            return res.status(400).json({ error: { code: 'tenantSlug_and_name_required' } });
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const { plain, record } = await (0, apiKeys_1.createApiKey)(t.id, name, Array.isArray(scopes) ? scopes : []);
        return res.json({ apiKey: { id: record.id, tenantId: record.tenantId, name: record.name, scopes: record.scopes.split(',').filter(Boolean) }, secret: plain });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// GET /v1/admin/keys/:tenantSlug
router.get('/v1/admin/keys/:tenantSlug', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:read']), async (req, res) => {
    try {
        const slug = req.params.tenantSlug;
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const rows = await prisma.apiKey.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'desc' } });
        return res.json({ keys: rows.map((r) => ({ id: r.id, name: r.name, scopes: (r.scopes || '').split(',').filter(Boolean), lastUsedAt: r.lastUsedAt })) });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
// DELETE /v1/admin/keys/:id
router.delete('/v1/admin/keys/:id', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:write']), async (req, res) => {
    try {
        const id = req.params.id;
        const prisma = (0, client_1.getPrisma)();
        await prisma.apiKey.delete({ where: { id } });
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
