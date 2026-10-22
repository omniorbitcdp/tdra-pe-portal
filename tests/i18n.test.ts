/** Bilingual integrity: the Arabic dictionary must actually cover the UI. */
import { describe, it, expect } from 'vitest';
import { AR, LANGS, LANG_LABELS, translate, dirFor, isLang } from '@/lib/i18n';

const keys = Object.keys(AR);

describe('i18n: languages and direction', () => {
  it('supports exactly English and Arabic', () => {
    expect([...LANGS]).toEqual(['en', 'ar']);
    expect(LANG_LABELS.ar).toBe('عربي');
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });

  it('validates a stored language value', () => {
    expect(isLang('ar')).toBe(true);
    expect(isLang('EN')).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });

  it('returns the English source unchanged for English', () => {
    expect(translate('en', 'Grievances')).toBe('Grievances');
  });

  it('translates to Arabic', () => {
    expect(translate('ar', 'Grievances')).toBe('الشكاوى');
    expect(translate('ar', 'Sign out')).toBe('تسجيل الخروج');
  });

  it('falls back to readable English rather than a raw key', () => {
    expect(translate('ar', 'Some string nobody translated')).toBe('Some string nobody translated');
  });

  it('interpolates variables', () => {
    expect(translate('ar', 'Welcome to {name}', { name: 'ACME' })).toBe('مرحبًا بك في ACME');
    expect(translate('en', 'Welcome to {name}', { name: 'ACME' })).toBe('Welcome to ACME');
    expect(translate('ar', '{n}/4 verified', { n: 2 })).toBe('2/4 موثّق');
  });
});

describe('i18n: dictionary quality', () => {
  it('has a substantial dictionary', () => {
    expect(keys.length).toBeGreaterThan(300);
  });

  it('has no empty translation', () => {
    const empty = keys.filter((k) => !AR[k] || !AR[k].trim());
    expect(empty, `empty translations: ${empty.join(' | ')}`).toEqual([]);
  });

  it('translates every key into Arabic script', () => {
    // A handful of keys are codes, brands or symbols that must stay as-is.
    const keep = new Set(['—', 'POST', 'GET', 'SMS', 'OTP', 'HTTP', 'URL', 'PE ID',
      'GRV-12345678', 'https://suspicious-link.example', 'Entity &amp; Signatory']);
    const untranslated = keys.filter((k) => {
      if (keep.has(k) || !/[A-Za-z]{3,}/.test(k)) return false;
      return !/[\u0600-\u06FF]/.test(AR[k]);
    });
    expect(untranslated, `not translated: ${untranslated.join(' | ')}`).toEqual([]);
  });

  it('keeps placeholders in the Arabic string', () => {
    const broken = keys.filter((k) => {
      const tokens = k.match(/\{\w+\}/g) ?? [];
      return tokens.some((tok) => !AR[k].includes(tok));
    });
    expect(broken, `lost placeholders: ${broken.join(' | ')}`).toEqual([]);
  });
});
