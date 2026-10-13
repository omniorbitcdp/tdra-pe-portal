import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { ROLE_LABELS } from '@/lib/constants';
import { LogoutButton } from './LogoutButton';

export async function Shell({ children }: { children: React.ReactNode }) {
  const [session, settings] = await Promise.all([getSession(), getSettings()]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            {settings.logoDataUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={settings.logoDataUrl} alt={settings.operatorName} className="h-9 w-auto" />
              : <div className="flex h-9 w-9 items-center justify-center rounded-lg brand-bg text-sm font-bold text-white">{settings.operatorShortName.slice(0, 2).toUpperCase()}</div>}
            <div>
              <div className="text-sm font-bold leading-tight text-slate-900">{settings.operatorName}</div>
              <div className="text-xs text-slate-500">TDRA PE Registration Portal</div>
            </div>
          </Link>
          {session && (
            <div className="flex items-center gap-4">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-semibold text-slate-800">{session.name ?? session.email}</div>
                <div className="text-xs text-slate-500">{ROLE_LABELS[session.role]}</div>
              </div>
              {session.role === 'ADMIN' && <Link href="/admin" className="text-sm font-semibold brand-text">Admin</Link>}
              <LogoutButton />
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
