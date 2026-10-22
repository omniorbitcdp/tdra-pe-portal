import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession, homeForRole } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { getLang } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n';
import { navForRole, type NavGroup } from '@/lib/nav';
import { MODULES_FOR_ROLE, ROLE_LABELS, type ModuleKey } from '@/lib/constants';
import { TopNav } from './TopNav';
import { DeniedBanner } from './DeniedBanner';
import { LangToggle } from './LangToggle';
import { Icon } from './icons';

const STATUS_COLUMN: Record<ModuleKey, { table: string; column: string }> = {
  KYC: { table: 'entities', column: 'kyc_status' },
  HEADER: { table: 'header_registrations', column: 'status' },
  TEMPLATE: { table: 'template_registrations', column: 'status' },
  URL: { table: 'url_registrations', column: 'status' },
};

/** Badge counts are re-read on every server render (including a language switch).
 *  A few seconds of caching removes four COUNT queries from that path. */
const COUNT_TTL_MS = 5000;
const countCache = new Map<string, { at: number; value: Record<string, number> }>();

/** Counts of items awaiting reviewer action, per module — drives the nav badges. */
async function pendingCounts(modules: ModuleKey[]): Promise<Record<string, number>> {
  const key = modules.slice().sort().join(',');
  const hit = countCache.get(key);
  if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.value;

  const out: Record<string, number> = {};
  await Promise.all(modules.map(async (m) => {
    const { table, column } = STATUS_COLUMN[m];
    const { count } = await db().from(table)
      .select('id', { count: 'exact', head: true })
      .in(column, ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED']);
    out[m] = count ?? 0;
  }));
  countCache.set(key, { at: Date.now(), value: out });
  return out;
}

export interface AppShellProps {
  modules?: ModuleKey[];
  children: React.ReactNode;
}

export async function AppShell({ modules = [], children }: AppShellProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const groups: NavGroup[] = navForRole(session.role);
  if (groups.length === 0) redirect(homeForRole('PE'));

  const mods = modules.length > 0 ? modules : MODULES_FOR_ROLE[session.role];
  const [settings, pending, lang] = await Promise.all([getSettings(), pendingCounts(mods), getLang()]);
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);

  const name = session.name ?? session.email;
  const pendingTotal = Object.values(pending).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3">
          {/* Brand: logo and company name sit side by side, never overlapping */}
          <Link href={homeForRole(session.role)} className="flex min-w-0 items-center gap-3">
            {settings.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoDataUrl} alt={settings.operatorName}
                className="h-10 w-auto max-w-[160px] shrink-0 object-contain" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100">
                {settings.operatorShortName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight text-slate-800">{settings.operatorName}</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            {pendingTotal > 0 && (
              <span className="hidden items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 md:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {t('{n} awaiting your action', { n: pendingTotal })}
              </span>
            )}

            {/* Language switch — immediately before the signed-in user */}
            <LangToggle />

            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold leading-tight text-slate-800">{name}</span>
              <span className="block text-[11px] text-slate-500">{t(ROLE_LABELS[session.role])}</span>
            </span>
            <SignOutButton label={t('Sign out')} />
          </div>
        </div>

        <TopNav groups={groups} pending={pending} />
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-6">
        <Suspense fallback={null}><DeniedBanner /></Suspense>
        {children}
      </main>

      <footer className="mx-auto max-w-[1500px] px-5 pb-8 pt-2 text-center text-[11px] text-slate-400">
        © Onextel Copyright 2026
      </footer>
    </div>
  );
}

function SignOutButton({ label }: { label: string }) {
  return (
    <a href="/logout" className="btn-ghost btn-sm flex items-center gap-1.5">
      <Icon name="logout" className="h-3.5 w-3.5 rtl-flip" />
      {label}
    </a>
  );
}
