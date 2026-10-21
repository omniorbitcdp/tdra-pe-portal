'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty, StatCard, StatGrid } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';

interface G {
  id: string; grievance_code: string; status: string; category: string; reported_header: string;
  message_content: string; highlighted_url: string | null; highlighted_phone: string | null;
  subscriber_name: string | null; reporter: string; created_at: string; sla_due_at: string;
  acknowledged_at: string | null; resolved_at: string | null; resolution_remarks: string | null;
  attachment_path: string | null; attachment_name: string | null; match_method: string;
  overdue: boolean; hours_remaining: number | null;
}
interface Summary { open: number; overdue: number; resolved: number; total: number }

const OPEN = ['SUBMITTED', 'ACKNOWLEDGED'];

export default function PeGrievancesPage() {
  const [rows, setRows] = useState<G[]>([]);
  const [summary, setSummary] = useState<Summary>({ open: 0, overdue: 0, resolved: 0, total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<'OPEN' | 'ALL' | 'RESOLVED'>('OPEN');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(''); const [openId, setOpenId] = useState('');

  async function load() {
    const r = await api<{ grievances: G[]; summary: Summary }>('/api/pe/grievances');
    if (!r.ok) setError(r.data.error); else {
      const d = r.data as unknown as { grievances: G[]; summary: Summary };
      setRows(d.grievances ?? []); setSummary(d.summary ?? { open: 0, overdue: 0, resolved: 0, total: 0 });
    }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    filter === 'ALL' ? true : filter === 'OPEN' ? OPEN.includes(r.status) : r.status === 'RESOLVED'), [rows, filter]);

  async function act(id: string, action: string, remarks: string) {
    if (busyId) return;
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/pe/grievances', { method: 'POST', body: JSON.stringify({ id, action, remarks }) });
    setBusyId('');
    if (!res.ok) { setError(res.data.error ?? 'Could not update the grievance'); return; }
    setNotice(`Grievance ${action.toLowerCase()}d.`); setOpenId(''); await load();
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="Subscriber Grievances" subtitle="Reports matched to your headers. Resolve within the SLA shown against each case." />
      <ErrorBox message={error} /><Notice message={notice} />

      <StatGrid cols={4}>
        <StatCard label="Open" value={summary.open} tone="amber" hint="Awaiting your action" />
        <StatCard label="SLA lapsed" value={summary.overdue} tone="rose" />
        <StatCard label="Resolved" value={summary.resolved} tone="emerald" />
        <StatCard label="Total received" value={summary.total} />
      </StatGrid>

      <Card className="mt-5 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {([['OPEN', 'Open'], ['RESOLVED', 'Resolved'], ['ALL', 'All']] as Array<['OPEN' | 'RESOLVED' | 'ALL', string]>).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === k ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? <div className="p-5"><Empty>No grievances in this view.</Empty></div> : (
            <table className="table">
              <thead className="thead-row"><tr>
                <th className="th">Grievance</th><th className="th">Reported header</th><th className="th">Type</th>
                <th className="th">Received</th><th className="th">SLA</th><th className="th">Status</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {filtered.map((g) => (
                  <>
                    <tr key={g.id} className="tr">
                      <td className="td whitespace-nowrap font-mono text-xs">{g.grievance_code}</td>
                      <td className="td font-medium">{g.reported_header}</td>
                      <td className="td text-xs">{g.category}</td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{new Date(g.created_at).toLocaleDateString()}</td>
                      <td className="td text-xs">
                        {g.status === 'RESOLVED' || g.status === 'CLOSED'
                          ? <span className="text-emerald-600">Met</span>
                          : g.overdue
                            ? <span className="font-semibold text-rose-600">Lapsed</span>
                            : <span className="text-slate-600">{g.hours_remaining}h left</span>}
                      </td>
                      <td className="td"><StatusPill status={g.status} /></td>
                      <td className="td"><button className="btn-ghost btn-sm" onClick={() => setOpenId(openId === g.id ? '' : g.id)}>{openId === g.id ? 'Close' : 'Open'}</button></td>
                    </tr>
                    {openId === g.id && (
                      <tr key={`${g.id}-detail`}>
                        <td className="td bg-slate-50" colSpan={7}>
                          <GrievanceDetail g={g} busy={busyId === g.id} onAct={(a, r) => act(g.id, a, r)} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

function GrievanceDetail({ g, busy, onAct }: { g: G; busy: boolean; onAct: (a: string, r: string) => void }) {
  const [remarks, setRemarks] = useState('');
  return (
    <div className="space-y-4 py-1">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Message reported</div>
          <p className="mt-1 whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 text-sm text-slate-800">{g.message_content}</p>
        </div>
        <div className="space-y-3">
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reporter</div><p className="text-sm text-slate-800">{g.subscriber_name ?? 'Anonymous'} · {g.reporter}</p></div>
          {g.highlighted_url && <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Suspicious URL</div><p className="break-all text-sm text-rose-700">{g.highlighted_url}</p></div>}
          {g.highlighted_phone && <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone highlighted</div><p className="text-sm text-slate-800">{g.highlighted_phone}</p></div>}
          {g.attachment_path && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Screenshot</div>
              <a className="text-sm font-semibold text-blue-700 hover:underline" target="_blank" rel="noreferrer"
                href={`/api/grievances/attachment?id=${g.id}`}>{g.attachment_name ?? 'Open screenshot'}</a>
            </div>
          )}
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Matched by</div><p className="text-xs text-slate-600">{g.match_method.replace(/_/g, ' ').toLowerCase()}</p></div>
        </div>
      </div>

      {g.resolution_remarks && (
        <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Recorded outcome: {g.resolution_remarks}</div>
      )}

      {OPEN.includes(g.status) && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
          <div className="min-w-[280px] flex-1">
            <label className="label">Response note (required to resolve or decline)</label>
            <input className="input" placeholder="What did you find, and what did you do?" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onAct('ACKNOWLEDGE', remarks)}>Acknowledge</button>
          <button className="btn-success btn-sm" disabled={busy} onClick={() => onAct('RESOLVE', remarks)}>Resolve</button>
          <button className="btn-danger btn-sm" disabled={busy} onClick={() => onAct('REJECT', remarks)}>Not our header</button>
        </div>
      )}
    </div>
  );
}
