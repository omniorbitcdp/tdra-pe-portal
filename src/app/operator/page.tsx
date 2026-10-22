'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Card, StatCard, StatGrid, SectionTitle, Empty, Avatar } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { ROLE_LABELS, type Role } from '@/lib/constants';

interface ModuleSummary { module: string; label: string; href: string; pending: number; awaitingPe: number; approved: number; rejected: number; draft: number; total: number }
interface Recent { id: number; module: string; action: string; remarks: string | null; actor_name: string | null; actor_email: string | null; actor_role: string | null; created_at: string; to_status: string | null }
interface Data { role: Role; modules: ModuleSummary[]; mine: { approved: number; rejected: number; correction: number; total: number }; recent: Recent[] }

export default function OperatorWorkbench() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Data>('/api/operator/summary').then((r) => { if (!r.ok) setError(r.data.error); else setData(r.data as unknown as Data); }); }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loader />;

  const multi = data.modules.length > 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{tr("Approval Workbench")}</h1>
        <p className="mt-1 text-sm text-slate-500">{ROLE_LABELS[data.role]} — you can only see and action the queue{multi ? 's' : ''} assigned to your role.</p>
      </div>
      <Notice />

      {data.modules.map((m) => (
        <div key={m.module} className="mb-7">
          {multi && <SectionTitle>{m.label} registrations</SectionTitle>}
          <StatGrid cols={5}>
            <StatCard label={tr("Awaiting my action")} value={m.pending} tone="amber" href={m.href} active={m.pending > 0} />
            <StatCard label={tr("Awaiting PE")} value={m.awaitingPe} tone="sky" />
            <StatCard label={tr("Approved")} value={m.approved} tone="emerald" />
            <StatCard label={tr("Rejected")} value={m.rejected} tone="rose" />
            <StatCard label={tr("Total")} value={m.total} hint={m.draft ? `${m.draft} still in draft` : undefined} />
          </StatGrid>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-primary" href={m.href}>Open {m.label} queue{m.pending > 0 ? ` · ${m.pending} pending` : ''}</a>
          </div>
        </div>
      ))}

      <SectionTitle>{tr("My decisions")}</SectionTitle>
      <StatGrid cols={4}>
        <StatCard label={tr("Approved by me")} value={data.mine.approved} tone="emerald" />
        <StatCard label={tr("Rejected by me")} value={data.mine.rejected} tone="rose" />
        <StatCard label={tr("Corrections requested")} value={data.mine.correction} tone="amber" />
        <StatCard label={tr("Total actions")} value={data.mine.total} />
      </StatGrid>

      <SectionTitle>Recent activity in my queue{multi ? 's' : ''}</SectionTitle>
      <Card className="overflow-hidden p-0">
        {data.recent.length === 0 ? <div className="p-5"><Empty>{tr("No activity yet.")}</Empty></div> : (
          <table className="table">
            <thead className="thead-row"><tr>
              <th className="th">{tr("When")}</th><th className="th">{tr("Module")}</th><th className="th">{tr("Action")}</th>
              <th className="th">By</th><th className="th">{tr("Result")}</th><th className="th">{tr("Remarks")}</th>
            </tr></thead>
            <tbody>
              {data.recent.map((a) => (
                <tr key={a.id} className="tr">
                  <td className="td whitespace-nowrap text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="td">{a.module}</td>
                  <td className="td font-medium">{a.action.replace(/_/g, ' ')}</td>
                  <td className="td">
                    <span className="flex items-center gap-2">
                      <Avatar name={a.actor_name ?? a.actor_email ?? 'System'} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-700">{a.actor_name ?? a.actor_email ?? 'System'}</span>
                        <span className="block truncate text-[10px] text-slate-400">{a.actor_role ?? ''}</span>
                      </span>
                    </span>
                  </td>
                  <td className="td text-xs">{a.to_status?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="td max-w-[260px] text-xs text-slate-500">{a.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
