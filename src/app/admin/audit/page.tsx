'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, Empty, Avatar, Toolbar, StatCard, StatGrid } from '@/components/ui';
import { Loader, ErrorBox } from '@/components/nav';

interface Row {
  id: number; module: string; action: string; record_id: string | null;
  actor_name: string | null; actor_email: string | null; actor_role: string | null;
  from_status: string | null; to_status: string | null; remarks: string | null; created_at: string;
}

const MODULES = ['', 'KYC', 'DOCUMENT', 'HEADER', 'TEMPLATE', 'URL', 'ACCOUNT', 'AUTH', 'ADMIN', 'API_CONFIG'];
const DECISION_ACTIONS = ['APPROVE', 'REJECT', 'REQUEST_CORRECTION', 'VERIFY_DOCUMENT', 'APPROVE_INFO', 'REVOKE_INFO'];

export default function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [decisionsOnly, setDecisionsOnly] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (module) p.set('module', module);
    if (action) p.set('action', action);
    if (actor.trim()) p.set('actor', actor.trim());
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (decisionsOnly) p.set('decisions', '1');
    p.set('limit', '500');
    const r = await api<{ audit: Row[]; actions: string[] }>(`/api/admin/audit?${p.toString()}`);
    if (!r.ok) setError(r.data.error);
    else { const d = r.data as unknown as { audit: Row[]; actions: string[] }; setRows(d.audit ?? []); setActions(d.actions ?? []); }
    setLoaded(true);
  }, [module, action, actor, decisionsOnly, from, to]);

  useEffect(() => { load(); }, [load]);

  const approved = rows.filter((r) => r.action === 'APPROVE').length;
  const rejected = rows.filter((r) => r.action === 'REJECT').length;
  const corrections = rows.filter((r) => r.action === 'REQUEST_CORRECTION').length;
  const people = new Set(rows.map((r) => r.actor_email).filter(Boolean)).size;

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="Audit Trail" subtitle="Who did what, when — reviewer, action, remarks and the status transition. Immutable, append-only." />
      <ErrorBox message={error} />

      <StatGrid cols={4}>
        <StatCard label="Approvals in view" value={approved} tone="emerald" />
        <StatCard label="Rejections in view" value={rejected} tone="rose" />
        <StatCard label="Corrections requested" value={corrections} tone="amber" />
        <StatCard label="Distinct reviewers" value={people} />
      </StatGrid>

      <Card className="mt-5 overflow-hidden p-0">
        <Toolbar>
          <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
            <div><div className="label">Module</div>
              <select className="input max-w-[170px]" value={module} onChange={(e) => setModule(e.target.value)}>
                {MODULES.map((m) => <option key={m} value={m}>{m || 'All modules'}</option>)}
              </select></div>
            <div><div className="label">Action</div>
              <select className="input max-w-[200px]" value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">All actions</option>
                {actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
              </select></div>
            <div><div className="label">Reviewer (name or email)</div>
              <input className="input max-w-[220px]" placeholder="e.g. Aisha" value={actor} onChange={(e) => setActor(e.target.value)} /></div>
            <div><div className="label">From</div><input type="date" className="input max-w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><div className="label">To</div><input type="date" className="input max-w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-600">
              <input type="checkbox" checked={decisionsOnly} onChange={(e) => setDecisionsOnly(e.target.checked)} />
              Decisions only
            </label>
            <button className="btn-ghost mb-0.5" onClick={() => { setModule(''); setAction(''); setActor(''); setFrom(''); setTo(''); setDecisionsOnly(true); }}>Reset</button>
          </div>
        </Toolbar>

        <div className="overflow-x-auto">
          {rows.length === 0 ? <div className="px-5 pb-5"><Empty>No audit entries match these filters.</Empty></div> : (
            <table className="table">
              <thead className="thead-row"><tr>
                <th className="th">When</th><th className="th">Reviewer</th><th className="th">Module</th>
                <th className="th">Action</th><th className="th">Transition</th><th className="th">Remarks</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="tr">
                    <td className="td whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="td">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.actor_name ?? r.actor_email ?? 'System'} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-slate-800">{r.actor_name ?? r.actor_email ?? 'System'}</span>
                          <span className="block truncate text-[10px] text-slate-400">{r.actor_email}{r.actor_role ? ` · ${r.actor_role.replace(/_/g, ' ')}` : ''}</span>
                        </span>
                      </span>
                    </td>
                    <td className="td text-xs">{r.module}</td>
                    <td className="td">
                      <span className={`pill ring-1 ring-inset ${DECISION_ACTIONS.includes(r.action) ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                        {r.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="td space-x-1 whitespace-nowrap text-xs">
                      {r.from_status && <span className="text-slate-400">{r.from_status.replace(/_/g, ' ')}</span>}
                      {r.from_status && <span className="text-slate-300">→</span>}
                      <span className="font-semibold text-slate-700">{r.to_status?.replace(/_/g, ' ') ?? '—'}</span>
                    </td>
                    <td className="td max-w-[320px] text-xs text-slate-600">{r.remarks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
