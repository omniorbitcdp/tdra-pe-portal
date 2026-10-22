'use client';
// Language context. The choice lives in a cookie (so server components agree)
// and in localStorage (so a fresh tab keeps it even before the cookie is read).
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_LANG, isLang, LANG_COOKIE, translate, type Lang, type TVars,
} from '@/lib/i18n';
import { setLiveLang } from '@/lib/i18n/live';

interface LangCtx {
  lang: Lang;
  setLang: (next: Lang) => void;
  dir: 'ltr' | 'rtl';
  t: (key: string, vars?: TVars) => string;
}

const Ctx = createContext<LangCtx>({
  lang: DEFAULT_LANG,
  setLang: () => undefined,
  dir: 'ltr',
  t: (key, vars) => translate(DEFAULT_LANG, key, vars),
});

function writeCookie(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  // Keep the hook-free `t()` in step before anything renders.
  setLiveLang(lang);
  const router = useRouter();
  // Server-rendered text (shell, server pages) is refreshed as a NON-urgent
  // transition, so the click paints instantly and never waits on a fetch.
  const [, startTransition] = useTransition();

  // A choice made in another tab (or before the cookie was set) wins on mount.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(LANG_COOKIE); } catch { stored = null; }
    if (isLang(stored) && stored !== initial) {
      setLangState(stored);
      writeCookie(stored);
      startTransition(() => router.refresh());
    }
  }, [initial, router, startTransition]);

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { window.localStorage.setItem(LANG_COOKIE, next); } catch { /* private mode */ }
    writeCookie(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    // Client text has already switched; sync the server-rendered bits in the
    // background so the UI never freezes mid-toggle.
    startTransition(() => router.refresh());
  }, [router, startTransition]);

  const value = useMemo<LangCtx>(() => ({
    lang,
    setLang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    t: (key, vars) => translate(lang, key, vars),
  }), [lang, setLang]);

  // Re-key on language change so every screen re-renders through t().
  return (
    <Ctx.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useLang(): LangCtx { return useContext(Ctx); }

/** Shorthand for components that only need the translate function. */
export function useT() { return useContext(Ctx).t; }
