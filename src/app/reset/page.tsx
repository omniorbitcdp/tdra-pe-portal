import Link from 'next/link';
import { SetPasswordForm } from '@/components/SetPasswordForm';
import { getLang } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n';
import { LangToggle } from '@/components/LangToggle';

export const dynamic = 'force-dynamic';

export default async function ResetPage({ searchParams }: { searchParams: { token?: string } }) {
  const lang = await getLang();
  const t = (k: string) => translate(lang, k);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-4 flex justify-end"><LangToggle /></div>
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900">{t('Reset password')}</h1>
        {searchParams.token
          ? <SetPasswordForm token={searchParams.token} />
          : <p className="mt-4 text-sm text-rose-600">{t('Missing reset token. Use the link from your email.')}</p>}
        <p className="mt-4 text-xs text-slate-500"><Link className="brand-text font-semibold" href="/login">{t('Back to sign in')}</Link></p>
      </div>
    </div>
  );
}
