import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession, homeForRole } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { navForRole } from '@/lib/nav';
import { MODULES_FOR_ROLE, ROLE_LABELS, type ModuleKey } from '@/lib/constants';
import { Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { DeniedBanner } from './DeniedBanner';

const STATUS_COLUMN: Record<ModuleKey, { table: string; column: string }> = {
  KYC: { table: 'entities', column: 'kyc_status' },
  HEADER: { table: 'header_registrations', column: 'status' },
  TEMPLATE: { table: 'template_registrations', column: 'status' },
  URL: { table: 'url_registrations', column: 'status' },
};

/** Counts of items awaiting reviewer action, per module — drives sidebar badges. */
async function pendingCounts(modules: ModuleKey[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(modules.map(async (m) => {
    const { table, column } = STATUS_COLUMN[m];
    const { count } = await db().from(table)
      .select('id', { count: 'exact', head: true })
      .in(column, ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED']);
    out[m] = count ?? 0;
  }));
  return out;
}

export interface AppShellProps {
  /** Module the signed-in reviewer owns — scopes the sidebar badges. */
  modules?: ModuleKey[];
  /** Shown as a banner when the user was bounced out of a page they cannot open. */
  denied?: boolean;
  children: React.ReactNode;
}

export async function AppShell({ modules = [], denied, children }: AppShellProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const groups = navForRole(session.role);
  if (groups.length === 0) redirect(homeForRole('PE'));

  // Resolve the caller's own module set when not supplied (operators).
  const mods = modules.length > 0 ? modules : MODULES_FOR_ROLE[session.role];
  const [settings, pending] = await Promise.all([getSettings(), pendingCounts(mods)]);

  const name = session.name ?? session.email;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U';

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar
        groups={groups}
        pending={pending}
        user={{ name, email: session.email, roleLabel: ROLE_LABELS[session.role], initials }}
        operator={{ name: settings.operatorName, logoDataUrl: settings.logoDataUrl, shortName: settings.operatorShortName }}
      />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-5 py-6 lg:px-8">
          <Suspense fallback={null}><DeniedBanner /></Suspense>
          {children}
        </div>
      </div>
    </div>
  );
}
