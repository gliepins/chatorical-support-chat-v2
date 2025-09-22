"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
// GET /v1/admin/audit/:tenantSlug/export?from=ISO&to=ISO
router.get('/v1/admin/audit/:tenantSlug/export', (0, serviceAuth_1.requireServiceOrApiKey)(['admin:read']), async (req, res) => {
    try {
        const slug = req.params.tenantSlug;
        const prisma = (0, client_1.getPrisma)();
        const t = await prisma.tenant.findUnique({ where: { slug } });
        if (!t)
            return res.status(404).json({ error: { code: 'tenant_not_found' } });
        const apiKey = req.apiKey;
        if (apiKey && apiKey.tenantId !== t.id)
            return res.status(403).json({ error: { code: 'cross_tenant_forbidden' } });
        const fromStr = String(req.query.from || '');
        const toStr = String(req.query.to || '');
        const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const to = toStr ? new Date(toStr) : new Date();
        const rows = await prisma.auditLog.findMany({ where: { tenantId: t.id, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' } });
        res.header('content-type', 'application/json');
        return res.json({ tenantId: t.id, from: from.toISOString(), to: to.toISOString(), entries: rows });
    }
    catch (e) {
        return res.status(500).json({ error: { code: 'internal_error', message: e?.message } });
    }
});
exports.default = router;
