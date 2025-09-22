"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTemplateText = resolveTemplateText;
exports.renderTemplate = renderTemplate;
const client_1 = require("../db/client");
async function resolveTemplateText(tenantId, key, locale) {
    const prisma = (0, client_1.getPrisma)();
    const tryLocales = [];
    const l = (locale || '').trim().toLowerCase();
    if (l) {
        tryLocales.push(l);
        if (l.length > 2)
            tryLocales.push(l.slice(0, 2));
    }
    tryLocales.push('default');
    for (const lc of tryLocales) {
        const row = await prisma.messageTemplateLocale.findUnique({ where: { tenantId_key_locale: { tenantId, key, locale: lc } } });
        if (row && row.enabled)
            return row.text;
    }
    return null;
}
function renderTemplate(text, vars) {
    return text.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_m, v) => (v in vars ? String(vars[v]) : `{${v}}`));
}
