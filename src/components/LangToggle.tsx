'use client';
// Segmented EN | عربي switch — sits in the header next to the signed-in user.
import { LANG_LABELS, LANGS, type Lang } from '@/lib/i18n';
import { useLang } from './LangProvider';

export function LangToggle({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { lang, setLang } = useLang();

  const base = 'rounded-md px-2.5 py-1 text-[11px] font-bold uppercase leading-none transition';
  const active = 'bg-[var(--brand)] text-white shadow-sm';
  const idle = tone === 'dark'
    ? 'text-white/70 hover:text-white'
    : 'text-slate-500 hover:text-slate-800';

  return (
    <div
      role="group"
      aria-label="Language / اللغة"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5 ${
        tone === 'dark' ? 'border-white/25 bg-white/10' : 'border-slate-200 bg-slate-50'} ${className}`}
    >
      {LANGS.map((l: Lang) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          title={l === 'en' ? 'English' : 'العربية'}
          onClick={() => setLang(l)}
          className={`${base} ${lang === l ? active : idle} ${l === 'ar' ? 'font-ar' : ''}`}
        >
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
