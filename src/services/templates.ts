import { getPrisma } from '../db/client';

export async function resolveTemplateText(tenantId: string, key: string, locale?: string): Promise<string | null> {
  const prisma = getPrisma();
  const tryLocales: string[] = [];
  const l = (locale || '').trim().toLowerCase();
  if (l) {
    tryLocales.push(l);
    if (l.length > 2) tryLocales.push(l.slice(0, 2));
  }
  tryLocales.push('default');
  for (const lc of tryLocales) {
    const row = await (prisma as any).messageTemplateLocale.findUnique({ where: { tenantId_key_locale: { tenantId, key, locale: lc } } });
    if (row && row.enabled) return row.text as string;
  }
  return null;
}

export function renderTemplate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_m, v) => (v in vars ? String(vars[v]) : `{${v}}`));
}


