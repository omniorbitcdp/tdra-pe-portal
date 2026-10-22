import Link from 'next/link';
import { ForgotForm } from '@/components/ForgotForm';
import { getLang } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n';
import { LangToggle } from '@/components/LangToggle';

export const dynamic = 'force-dynamic';

export default async function ForgotPage() {
  const lang = await getLang();
  const t = (k: string) => translate(lang, k);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-4 flex justify-end"><LangToggle /></div>
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900">{t('Forgot password')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('We will email you a secure, time-limited reset link.')}</p>
        <ForgotForm />
        <p className="mt-4 text-xs text-slate-500"><Link className="brand-text font-semibold" href="/login">{t('Back to sign in')}</Link></p>
      </div>
    </div>
  );
}
