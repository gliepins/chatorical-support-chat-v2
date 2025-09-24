"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTenantContextAsync = resolveTenantContextAsync;
exports.tenantContext = tenantContext;
const client_1 = require("../db/client");
const env_1 = require("../config/env");
const slugToIdCache = new Map();
async function getTenantIdBySlug(slug) {
    if (slugToIdCache.has(slug))
        return slugToIdCache.get(slug);
    const prisma = (0, client_1.getPrisma)();
    let t = await prisma.tenant.findUnique({ where: { slug } });
    if (!t && slug === 'default') {
        try {
            t = await prisma.tenant.create({ data: { name: 'Default', slug: 'default' } });
        }
        catch {
            t = await prisma.tenant.findUnique({ where: { slug } });
        }
    }
    if (!t)
        throw new Error('tenant_not_found');
    slugToIdCache.set(slug, t.id);
    return t.id;
}
async function resolveTenantContextAsync(req) {
    // Prefer API key-derived tenant if present
    const apiKey = req.apiKey;
    if (apiKey && apiKey.tenantId) {
        return { tenantId: apiKey.tenantId };
    }
    // Then allow explicit query param override (?t=tenant-slug) for environments where headers are stripped
    try {
        const q = (req.query && req.query.t) ? String(req.query.t) : '';
        if (q && q.trim().length > 0) {
            const tenantId = await getTenantIdBySlug(q.trim());
            return { tenantId };
        }
    }
    catch { }
    const header = req.header('x-tenant-id');
    const slug = (header && header.trim()) || (env_1.CONFIG.featureTenantEnforced ? '' : 'default');
    if (!slug)
        throw new Error('tenant_missing');
    const tenantId = await getTenantIdBySlug(slug);
    return { tenantId };
}
function tenantContext(req, res, next) {
    resolveTenantContextAsync(req)
        .then((tc) => { req.tenant = tc; next(); })
        .catch((_e) => res.status(400).json({ error: { code: 'tenant_not_found' } }));
}
