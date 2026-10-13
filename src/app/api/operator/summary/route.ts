import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest } from '@/lib/http';
import { MODULES_FOR_ROLE, REG_STATUS_LABELS, type ModuleKey, type RegStatus } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const TABLE: Record<ModuleKey, { table: string; column: string; href: string; label: string }> = {
  KYC:      { table: 'entities',               column: 'kyc_status', href: '/operator/kyc',      label: 'KYC' },
  HEADER:   { table: 'header_registrations',   column: 'status',     href: '/operator/headers',  label: 'Header' },
  TEMPLATE: { table: 'template_registrations', column: 'status',     href: '/operator/templates', label: 'Template' },
  URL:      { table: 'url_registrations',      column: 'status',     href: '/operator/urls',     label: 'URL' },
};

/** Items awaiting MY action (submitted / under review / resubmitted). */
const PENDING: RegStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'];
/** Items waiting on the PE, and closed items. */
const AWAITING_PE: RegStatus[] = ['CLARIFICATION_REQUIRED'];

function summarise(rows: Array<{ status: string }>) {
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const at = (list: RegStatus[]) => list.reduce((n, s) => n + (byStatus[s] ?? 0), 0);
  return { byStatus, pending: at(PENDING), awaitingPe: at(AWAITING_PE), approved: byStatus.APPROVED ?? 0, rejected: byStatus.REJECTED ?? 0, draft: byStatus.DRAFT ?? 0, total: rows.length };
}

/**
 * Role-scoped dashboard data for the operator workbench. A queue manager only
 * ever receives the modules they own.
 */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN']); if (g) return g;

  const requested = req.nextUrl.searchParams.get('module') as ModuleKey | null;
  const owned = MODULES_FOR_ROLE[s!.role];
  if (requested && !owned.includes(requested)) {
    return json({ ok: false, error: 'Your role cannot view that module.' }, 403);
  }
  const modules = requested ? [requested] : owned;
  if (modules.some((m) => !TABLE[m])) return badRequest('Invalid module.');

  const client = db();
  const [summaries, myActions, recent] = await Promise.all([
    Promise.all(modules.map(async (m) => {
      const { table, column, href, label } = TABLE[m];
      // Fixed select list per module (a dynamic column name defeats the typed client).
      const select = column === 'kyc_status' ? 'id,kyc_status' : 'id,status';
      const { data } = await client.from(table).select(select).limit(2000);
      const rows = ((data ?? []) as unknown as Array<Record<string, string>>)
        .map((r) => ({ status: r[column] ?? '' }));
      return { module: m, label, href, ...summarise(rows) };
    })),
    // What THIS reviewer has decided — makes the workbench personal.
    client.from('audit_log').select('action, created_at')
      .eq('actor_id', s!.uid).in('action', ['APPROVE', 'REJECT', 'REQUEST_CORRECTION']).limit(2000),
    client.from('audit_log')
      .select('id,module,action,record_id,from_status,to_status,remarks,actor_name,actor_email,actor_role,created_at,entity_id')
      .in('module', modules).order('created_at', { ascending: false }).limit(12),
  ]);

  const acts = (myActions.data ?? []) as Array<{ action: string; created_at: string }>;
  const mine = {
    approved: acts.filter((a) => a.action === 'APPROVE').length,
    rejected: acts.filter((a) => a.action === 'REJECT').length,
    correction: acts.filter((a) => a.action === 'REQUEST_CORRECTION').length,
    total: acts.length,
  };

  return json({
    ok: true,
    role: s!.role,
    modules: summaries,
    mine,
    recent: recent.data ?? [],
    statusLabels: REG_STATUS_LABELS,
  });
}
