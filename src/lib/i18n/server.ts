// Server-side language lookup. Cookies are read per request so the first paint
// already carries the right lang / dir — no flash of English on an Arabic page.
import { cookies } from 'next/headers';
import { DEFAULT_LANG, isLang, LANG_COOKIE, type Lang } from './index';

export async function getLang(): Promise<Lang> {
  try {
    const value = (await cookies()).get(LANG_COOKIE)?.value;
    return isLang(value) ? value : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}
