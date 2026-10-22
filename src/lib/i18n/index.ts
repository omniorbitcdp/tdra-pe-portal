// Bilingual support (English / Arabic). The English string is the key, so a
// missing translation degrades to readable English instead of a raw key token.
import { arCommon } from './ar-common';
import { arAuth } from './ar-auth';
import { arPe } from './ar-pe';
import { arOperator } from './ar-operator';
import { arAdmin } from './ar-admin';
import { arGrievance } from './ar-grievance';
import { arExtra } from './ar-extra';

export const LANGS = ['en', 'ar'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_COOKIE = 'tdra_lang';
export const DEFAULT_LANG: Lang = 'en';

export const LANG_LABELS: Record<Lang, string> = { en: 'EN', ar: 'عربي' };
export const LANG_NAMES: Record<Lang, string> = { en: 'English', ar: 'العربية' };

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'ar';
}

/** Arabic dictionary. Keys are the English source strings. */
export const AR: Record<string, string> = {
  ...arCommon,
  ...arAuth,
  ...arPe,
  ...arOperator,
  ...arAdmin,
  ...arGrievance,
  ...arExtra,
};

export function dirFor(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export type TVars = Record<string, string | number>;

/**
 * Translate one string. `{name}` placeholders are filled from `vars`.
 * Numbers stay Western digits so codes, IDs and dates remain unambiguous.
 */
export function translate(lang: Lang, key: string, vars?: TVars): string {
  const raw = lang === 'ar' ? AR[key] ?? key : key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : match);
}

/** `t('{n} awaiting your action', { n: 3 })` → Arabic-safe count phrase. */
export function tCount(lang: Lang, key: string, n: number): string {
  return translate(lang, key, { n });
}
