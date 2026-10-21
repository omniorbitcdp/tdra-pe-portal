'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty, StatCard, StatGrid } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import {
  GRIEVANCE_OPEN, GRIEVANCE_WITH_ADMIN, GRIEVANCE_CONCLUDED,
  GRIEVANCE_STATUS_LABELS, GRIEVANCE_ACTION_LABELS,
  type GrievanceAction, type GrievanceStatus,
} from '@/lib/grievance';

interface G {
  id: string; grievance_code: string; status: GrievanceStatus; category: string; reported_header: string;
  message_content: string; highlighted_url: string | null; highlighted_phone: string | null;
  subscriber_name: string | null; reporter: string; created_at: string; sla_due_at: string;
  acknowledged_at: string | null; resolved_at: string | null; resolution_remarks: string | null;
  attachment_path: string | null; attachment_name: string | null; match_method: string;
  escalated_at: string | null; escalated_by_role: string | null; escalation_reason: string | null;
  returned_at: string | null; return_reason: string | null;
  reopened_at: string | null; reopen_reason: string | null; reopen_count: number | null;
  closed_at: string | null;
  overdue: boolean; hours_remaining: number | null;
  actions: GrievanceAction[];
}
interface Summary { open: number; overdue: number; resolved: number; escalated: number; total: number }

type Tab = 'OPEN' | 'ESCALATED' | 'CONCLUDED' | 'ALL';

const PAST: Partial<Record<GrievanceAction, string>> = {
  ACKNOWLEDGE: 'Acknowledged', RESOLVE: 'Resolved', REJECT: 'Declined',
  CLOSE: 'Closed', ESCALATE: 'Escalated to the platform administrator',
};

const BTN: Record<GrievanceAction, string> = {
  ACKNOWLEDGE: 'btn-ghost btn-sm',
  RESOLVE: 'btn-success btn-sm',
  REJECT: 'btn-danger btn-sm',
  CLOSE: 'btn-ghost btn-sm',
  ESCALATE: 'rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50',
  RETURN_TO_PE: 'btn-ghost btn-sm',
  REOPEN: 'btn-ghost btn-sm',
};

export default function PeGrievancesPage() {
  const [rows, setRows] = useState<G[]>([]);
  const [summary, setSummary] = useState<Summary>({ open: 0, overdue: 0, resolved: 0, escalated: 0, total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('OPEN');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(''); const [openId, setOpenId] = useState('');

  const load = useCallback(async () => {
    const r = await api<{ grievances: G[]; summary: Summary }>('/api/pe/grievances');
    if (!r.ok) setError(r.data.error); else {
      const d = r.data as unknown as { grievances: G[]; summary: Summary };
      setRows(d.grievances ?? []);
      setSummary(d.summary ?? { open: 0, overdue: 0, resolved: 0, escalated: 0, total: 0 });
    }
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A decision taken elsewhere (or a case returned by telco) shows up on focus.
  useEffect(() => {
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    const timer = setInterval(onFocus, 60000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(timer); };
  }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tab === 'ALL') return true;
    if (tab === 'OPEN') return GRIEVANCE_OPEN.includes(r.status);
    if (tab === 'ESCALATED') return GRIEVANCE_WITH_ADMIN.includes(r.status);
    return GRIEVANCE_CONCLUDED.includes(r.status);
  }), [rows, tab]);

  const count = useMemo(() => ({
    OPEN: rows.filter((r) => GRIEVANCE_OPEN.includes(r.status)).length,
    ESCALATED: rows.filter((r) => GRIEVANCE_WITH_ADMIN.includes(r.status)).length,
    CONCLUDED: rows.filter((r) => GRIEVANCE_CONCLUDED.includes(r.status)).length,
    ALL: rows.length,
  }), [rows]);

  async function act(id: string, action: GrievanceAction, remarks: string) {
    if (busyId) return;
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/pe/grievances', { method: 'POST', body: JSON.stringify({ id, action, remarks }) });
    setBusyId('');
    if (!res.ok) { setError(res.data.error ?? 'Could not update the grievance'); return; }
    setNotice(`Grievance ${PAST[action] ?? action.toLowerCase()}.`);
    setOpenId('');
    await load();
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="Subscriber Grievances" subtitle="Reports matched to your headers. Respond within the SLA shown; escalate to the platform administrator when you need a ruling." />
      <ErrorBox message={error} /><Notice message={notice} />

      <StatGrid cols={4}>
        <StatCard label="Open" value={summary.open} tone="amber" hint="Awaiting your action" />
        <StatCard label="With telco" value={summary.escalated} tone="sky" hint="Escalated for review" />
        <StatCard label="SLA lapsed" value={summary.overdue} tone="rose" />
        <StatCard label="Total received" value={summary.total} />
      </StatGrid>

      <Card className="mt-5 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {([['OPEN', 'Open'], ['ESCALATED', 'Escalated'], ['CONCLUDED', 'Concluded'], ['ALL', 'All']] as Array<[Tab, string]>).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === k ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label} ({count[k]})
            </button>
          ))}
          <button className="ml-auto text-xs font-semibold text-blue-700 hover:underline" onClick={() => void load()}>Refresh</button>
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
                  <Fragment key={g.id}>
                    <tr className="tr">
                      <td className="td whitespace-nowrap font-mono text-xs">{g.grievance_code}</td>
                      <td className="td font-medium">{g.reported_header}</td>
                      <td className="td text-xs">{g.category}</td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{new Date(g.created_at).toLocaleDateString()}</td>
                      <td className="td text-xs">
                        {GRIEVANCE_CONCLUDED.includes(g.status) || g.status === 'ESCALATED'
                          ? <span className="text-slate-400">—</span>
                          : g.overdue
                            ? <span className="font-semibold text-rose-600">Lapsed</span>
                            : <span className="text-slate-600">{g.hours_remaining}h left</span>}
                      </td>
                      <td className="td"><StatusPill status={g.status} label={GRIEVANCE_STATUS_LABELS[g.status] ?? g.status} /></td>
                      <td className="td">
                        <button className="btn-ghost btn-sm" onClick={() => setOpenId(openId === g.id ? '' : g.id)}>
                          {openId === g.id ? 'Hide' : 'Open'}
                        </button>
                      </td>
                    </tr>
                    {openId === g.id && (
                      <tr>
                        <td className="td bg-slate-50" colSpan={7}>
                          <GrievanceDetail g={g} busy={busyId === g.id} onAct={(a, r) => void act(g.id, a, r)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

function GrievanceDetail({ g, busy, onAct }: { g: G; busy: boolean; onAct: (a: GrievanceAction, r: string) => void }) {
  const [remarks, setRemarks] = useState('');
  const [touched, setTouched] = useState(false);
  const actions = g.actions ?? [];
  const needsNote = actions.some((a) => a !== 'ACKNOWLEDGE');
  const tooShort = touched && remarks.trim().length < 5;

  function run(a: GrievanceAction) {
    setTouched(true);
    if (a !== 'ACKNOWLEDGE' && remarks.trim().length < 5) return;
    onAct(a, remarks.trim());
  }

  return (
    <div className="space-y-4 py-1">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Message reported</div>
          <p className="mt-1 whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 text-sm text-slate-800">{g.message_content}</p>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reporter</div>
            <p className="text-sm text-slate-800">{g.subscriber_name ?? 'Anonymous'} · {g.reporter}</p>
          </div>
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

      {g.escalated_at && (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <strong>Escalated to the platform administrator</strong>
          {g.escalated_by_role ? <> by {g.escalated_by_role.replace(/_/g, ' ').toLowerCase()}</> : null}
          {' '}on {new Date(g.escalated_at).toLocaleString()}.
          {g.escalation_reason && <span className="mt-1 block text-indigo-800">Reason: {g.escalation_reason}</span>}
        </div>
      )}

      {g.return_reason && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Returned to you for justification</strong>
          {g.returned_at ? <> on {new Date(g.returned_at).toLocaleString()}</> : null}.
          <span className="mt-1 block text-amber-800">Administrator note: {g.return_reason}</span>
        </div>
      )}

      {(g.reopen_count ?? 0) > 0 && (
        <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Re-opened by the reporter {(g.reopen_count ?? 0) === 1 ? 'once' : `${g.reopen_count} times`}
          {g.reopened_at ? <> — latest on {new Date(g.reopened_at).toLocaleString()}</> : null}.
          {g.reopen_reason && <span className="mt-1 block text-sky-800">Reason given: {g.reopen_reason}</span>}
        </div>
      )}

      {g.resolution_remarks && (
        <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Recorded outcome: {g.resolution_remarks}</div>
      )}

      {actions.length === 0 ? (
        <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          {g.status === 'ESCALATED'
            ? 'With the platform administrator — you can respond again once it is returned to you.'
            : `This grievance is ${GRIEVANCE_STATUS_LABELS[g.status]?.toLowerCase() ?? g.status.toLowerCase()} — no action is needed from you.`}
        </p>
      ) : (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div>
            <label className="label">Note for the record {needsNote && <span className="text-rose-600">(required, min 5 characters)</span>}</label>
            <input className={`input ${tooShort ? 'border-rose-300 ring-1 ring-rose-200' : ''}`}
              placeholder="What did you find, and what did you do?"
              value={remarks}
              onChange={(e) => { setRemarks(e.target.value); setTouched(false); }} />
            {tooShort && <p className="mt-1 text-xs text-rose-600">Add a short note before you continue.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((a) => (
              <button key={a} className={BTN[a]} disabled={busy} onClick={() => run(a)}>
                {GRIEVANCE_ACTION_LABELS[a]}
              </button>
            ))}
            {busy && <span className="text-xs text-slate-500">Saving…</span>}
          </div>
          {actions.includes('ESCALATE') && (
            <p className="text-[11px] text-slate-500">
              Escalating hands the case to the platform administrator — use it when the report is disputed,
              the sender ID is spoofed, or a ruling is needed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
