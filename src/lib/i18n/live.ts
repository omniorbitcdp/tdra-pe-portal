// A hook-free translate bound to the *current* language, so presentational
// components and page bodies do not each need a React hook. LangProvider keeps
// this in sync and re-keys the tree on change, so every screen re-renders.
import { DEFAULT_LANG, translate, type Lang, type TVars } from './index';

let current: Lang = DEFAULT_LANG;

export function setLiveLang(lang: Lang): void { current = lang; }
export function liveLang(): Lang { return current; }
export function t(key: string, vars?: TVars): string { return translate(current, key, vars); }
