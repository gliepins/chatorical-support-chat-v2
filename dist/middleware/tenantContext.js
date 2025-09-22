"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTenantContextAsync = resolveTenantContextAsync;
exports.tenantContext = tenantContext;
const client_1 = require("../db/client");
const slugToIdCache = new Map();
async function getTenantIdBySlug(slug) {
    if (slugToIdCache.has(slug))
        return slugToIdCache.get(slug);
    const prisma = (0, client_1.getPrisma)();
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t)
        throw new Error('tenant_not_found');
    slugToIdCache.set(slug, t.id);
    return t.id;
}
async function resolveTenantContextAsync(req) {
    const header = req.header('x-tenant-id');
    const slug = (header && header.trim()) || 'default';
    const tenantId = await getTenantIdBySlug(slug);
    return { tenantId };
}
function tenantContext(req, res, next) {
    resolveTenantContextAsync(req)
        .then((tc) => { req.tenant = tc; next(); })
        .catch(() => res.status(400).json({ error: 'tenant_not_found' }));
}
