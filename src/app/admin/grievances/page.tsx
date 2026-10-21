'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty, StatCard, StatGrid } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';

interface G {
  id: string; grievance_code: string; status: string; category: string; reported_header: string;
  message_content: string; highlighted_url: string | null; highlighted_phone: string | null;
  reporter: string; subscriber_name: string | null; enterprise: string | null; entity_id: string | null;
  created_at: string; sla_due_at: string; resolution_remarks: string | null;
  attachment_path: string | null; attachment_name: string | null; match_method: string;
  overdue: boolean; hours_remaining: number | null;
}
interface Summary { total: number; open: number; overdue: number; unmatched: number }
const OPEN = ['SUBMITTED', 'ACKNOWLEDGED'];

export default function AdminGrievancesPage() {
  const [rows, setRows] = useState<G[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, open: 0, overdue: 0, unmatched: 0 });
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'OPEN' | 'UNMATCHED' | 'ALL'>('OPEN');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(''); const [openId, setOpenId] = useState('');

  async function load() {
    const r = await api<{ grievances: G[]; summary: Summary }>('/api/admin/grievances');
    if (!r.ok) setError(r.data.error); else {
      const d = r.data as unknown as { grievances: G[]; summary: Summary };
      setRows(d.grievances ?? []); setSummary(d.summary ?? { total: 0, open: 0, overdue: 0, unmatched: 0 });
    }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    view === 'ALL' ? true : view === 'UNMATCHED' ? !r.entity_id : OPEN.includes(r.status)), [rows, view]);

  async function act(id: string, action: string, remarks: string) {
    if (busyId) return;
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/admin/grievances', { method: 'POST', body: JSON.stringify({ id, action, remarks }) });
    setBusyId('');
    if (!res.ok) { setError(res.data.error ?? 'Could not update the grievance'); return; }
    setNotice('Grievance updated.'); setOpenId(''); await load();
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="Grievance Oversight" subtitle="Every subscriber grievance across the platform, including ones no header could be matched to." />
      <ErrorBox message={error} /><Notice message={notice} />

      <StatGrid cols={4}>
        <StatCard label="Total" value={summary.total} />
        <StatCard label="Open" value={summary.open} tone="amber" />
        <StatCard label="SLA lapsed" value={summary.overdue} tone="rose" />
        <StatCard label="Unmatched" value={summary.unmatched} tone="sky" hint="No registered header" />
      </StatGrid>

      <Card className="mt-5 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {([['OPEN', 'Open'], ['UNMATCHED', 'Unmatched'], ['ALL', 'All']] as Array<['OPEN' | 'UNMATCHED' | 'ALL', string]>).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${view === k ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? <div className="p-5"><Empty>No grievances in this view.</Empty></div> : (
            <table className="table">
              <thead className="thead-row"><tr>
                <th className="th">Grievance</th><th className="th">Header</th><th className="th">Enterprise</th>
                <th className="th">Type</th><th className="th">SLA</th><th className="th">Status</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {filtered.map((g) => (
                  <>
                    <tr key={g.id} className="tr">
                      <td className="td whitespace-nowrap font-mono text-xs">{g.grievance_code}</td>
                      <td className="td font-medium">{g.reported_header}</td>
                      <td className="td text-xs">{g.enterprise ?? <span className="text-amber-700">Unmatched</span>}</td>
                      <td className="td text-xs">{g.category}</td>
                      <td className="td text-xs">{OPEN.includes(g.status) ? (g.overdue ? <span className="font-semibold text-rose-600">Lapsed</span> : `${g.hours_remaining}h left`) : <span className="text-slate-400">—</span>}</td>
                      <td className="td"><StatusPill status={g.status} /></td>
                      <td className="td"><button className="btn-ghost btn-sm" onClick={() => setOpenId(openId === g.id ? '' : g.id)}>{openId === g.id ? 'Close' : 'Open'}</button></td>
                    </tr>
                    {openId === g.id && (
                      <tr key={`${g.id}-d`}>
                        <td className="td bg-slate-50" colSpan={7}>
                          <div className="space-y-3 py-1">
                            <p className="whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 text-sm text-slate-800">{g.message_content}</p>
                            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                              <span>Reporter: {g.subscriber_name ?? 'Anonymous'} · {g.reporter}</span>
                              <span>Filed: {new Date(g.created_at).toLocaleString()}</span>
                              {g.highlighted_url && <span className="break-all text-rose-700">URL: {g.highlighted_url}</span>}
                              {g.highlighted_phone && <span>Phone: {g.highlighted_phone}</span>}
                              {g.attachment_path && <a className="font-semibold text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={`/api/grievances/attachment?id=${g.id}`}>{g.attachment_name ?? 'Screenshot'}</a>}
                            </div>
                            {g.resolution_remarks && <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Outcome: {g.resolution_remarks}</div>}
                            <AdminActions g={g} busy={busyId === g.id} onAct={(a, r) => act(g.id, a, r)} />
                          </div>
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

function AdminActions({ g, busy, onAct }: { g: G; busy: boolean; onAct: (a: string, r: string) => void }) {
  const [remarks, setRemarks] = useState('');
  if (!OPEN.includes(g.status) && g.status !== 'RESOLVED' && g.status !== 'REJECTED') {
    return <p className="text-xs text-slate-500">This grievance is {g.status.toLowerCase()} — no further action.</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
      <div className="min-w-[260px] flex-1">
        <label className="label">Note (required to close or reject)</label>
        <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason / outcome" />
      </div>
      {OPEN.includes(g.status) && <>
        <button className="btn-success btn-sm" disabled={busy} onClick={() => onAct('RESOLVE', remarks)}>Resolve</button>
        <button className="btn-danger btn-sm" disabled={busy} onClick={() => onAct('REJECT', remarks)}>Reject</button>
      </>}
      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onAct('CLOSE', remarks)}>Close</button>
    </div>
  );
}
