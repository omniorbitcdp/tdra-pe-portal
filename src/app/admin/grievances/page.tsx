'use client';
import { t as tr } from '@/lib/i18n/live';
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
  reporter: string; subscriber_name: string | null; enterprise: string | null; entity_id: string | null;
  created_at: string; sla_due_at: string; resolution_remarks: string | null;
  attachment_path: string | null; attachment_name: string | null; match_method: string;
  escalated_at: string | null; escalated_by_role: string | null; escalation_reason: string | null;
  returned_at: string | null; return_reason: string | null;
  reopened_at: string | null; reopen_reason: string | null; reopen_count: number | null;
  closed_at: string | null;
  overdue: boolean; hours_remaining: number | null;
  actions: GrievanceAction[];
}
interface Summary { total: number; open: number; escalated: number; overdue: number; unmatched: number }

type Tab = 'OPEN' | 'ESCALATED' | 'UNMATCHED' | 'ALL';

const PAST: Partial<Record<GrievanceAction, string>> = {
  RETURN_TO_PE: 'returned to the enterprise', RESOLVE: 'resolved', REJECT: 'rejected', CLOSE: 'closed',
};

const BTN: Record<GrievanceAction, string> = {
  RETURN_TO_PE: 'rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50',
  RESOLVE: 'btn-success btn-sm',
  REJECT: 'btn-danger btn-sm',
  CLOSE: 'btn-ghost btn-sm',
  ACKNOWLEDGE: 'btn-ghost btn-sm',
  ESCALATE: 'btn-ghost btn-sm',
  REOPEN: 'btn-ghost btn-sm',
};

export default function AdminGrievancesPage() {
  const [rows, setRows] = useState<G[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, open: 0, escalated: 0, overdue: 0, unmatched: 0 });
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('ESCALATED');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(''); const [openId, setOpenId] = useState('');

  const load = useCallback(async () => {
    const r = await api<{ grievances: G[]; summary: Summary }>('/api/admin/grievances');
    if (!r.ok) setError(r.data.error); else {
      const d = r.data as unknown as { grievances: G[]; summary: Summary };
      setRows(d.grievances ?? []);
      setSummary(d.summary ?? { total: 0, open: 0, escalated: 0, overdue: 0, unmatched: 0 });
    }
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tab === 'ALL') return true;
    if (tab === 'OPEN') return GRIEVANCE_OPEN.includes(r.status);
    if (tab === 'ESCALATED') return GRIEVANCE_WITH_ADMIN.includes(r.status);
    return !r.entity_id;
  }), [rows, tab]);

  const count = useMemo(() => ({
    OPEN: rows.filter((r) => GRIEVANCE_OPEN.includes(r.status)).length,
    ESCALATED: rows.filter((r) => GRIEVANCE_WITH_ADMIN.includes(r.status)).length,
    UNMATCHED: rows.filter((r) => !r.entity_id).length,
    ALL: rows.length,
  }), [rows]);

  async function act(id: string, action: GrievanceAction, remarks: string) {
    if (busyId) return;
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/admin/grievances', { method: 'POST', body: JSON.stringify({ id, action, remarks }) });
    setBusyId('');
    if (!res.ok) { setError(res.data.error ?? tr('Could not update the grievance')); return; }
    setNotice(`Grievance ${PAST[action] ?? action.toLowerCase()}.`);
    setOpenId('');
    await load();
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title={tr("Grievance Oversight")}
        subtitle={`Every subscriber grievance across the platform (${summary.total} in total), including ones no registered header could be matched to.`} />
      <ErrorBox message={error} /><Notice message={notice} />

      <StatGrid cols={4}>
        <StatCard label={tr("Open with enterprise")} value={summary.open} tone="amber" />
        <StatCard label={tr("Escalated to you")} value={summary.escalated} tone="sky" hint={tr("Awaiting a ruling")} />
        <StatCard label={tr("SLA lapsed")} value={summary.overdue} tone="rose" />
        <StatCard label={tr("Unmatched")} value={summary.unmatched} hint={tr("No registered header")} />
      </StatGrid>

      <Card className="mt-5 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {([['ESCALATED', 'Escalated'], ['OPEN', 'Open'], ['UNMATCHED', 'Unmatched'], ['ALL', 'All']] as Array<[Tab, string]>).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === k ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label} ({count[k]})
            </button>
          ))}
          <button className="ml-auto text-xs font-semibold text-blue-700 hover:underline" onClick={() => void load()}>{tr("Refresh")}</button>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? <div className="p-5"><Empty>{tr("No grievances in this view.")}</Empty></div> : (
            <table className="table">
              <thead className="thead-row"><tr>
                <th className="th">{tr("Grievance")}</th><th className="th">{tr("Header")}</th><th className="th">{tr("Enterprise")}</th>
                <th className="th">{tr("Status")}</th><th className="th">{tr("Raised")}</th><th className="th">{tr("SLA")}</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {filtered.map((g) => (
                  <Fragment key={g.id}>
                    <tr className="tr">
                      <td className="td whitespace-nowrap font-mono text-xs">{g.grievance_code}</td>
                      <td className="td font-medium">{g.reported_header}</td>
                      <td className="td text-xs">{g.enterprise ?? <span className="text-amber-700">{tr("Unmatched")}</span>}</td>
                      <td className="td"><StatusPill status={g.status} label={tr(GRIEVANCE_STATUS_LABELS[g.status] ?? g.status)} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{new Date(g.created_at).toLocaleDateString()}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {GRIEVANCE_OPEN.includes(g.status)
                          ? (g.overdue ? <span className="font-semibold text-rose-600">{tr("Lapsed")}</span> : <span className="text-slate-600">{g.hours_remaining}h left</span>)
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="td">
                        <button className="btn-ghost btn-sm" onClick={() => setOpenId(openId === g.id ? '' : g.id)}>
                          {openId === g.id ? 'Hide' : 'Open'}
                        </button>
                      </td>
                    </tr>
                    {openId === g.id && (
                      <tr>
                        <td className="td bg-slate-50" colSpan={7}>
                          <Detail g={g} busy={busyId === g.id} onAct={(a, r) => void act(g.id, a, r)} />
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

function Detail({ g, busy, onAct }: { g: G; busy: boolean; onAct: (a: GrievanceAction, r: string) => void }) {
  const [remarks, setRemarks] = useState('');
  const [touched, setTouched] = useState(false);
  const actions = g.actions ?? [];
  const tooShort = touched && remarks.trim().length < 5;

  function run(a: GrievanceAction) {
    setTouched(true);
    if (remarks.trim().length < 5) return; // every admin action needs a note
    onAct(a, remarks.trim());
  }

  return (
    <div className="space-y-3 py-1">
      <p className="whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 text-sm text-slate-800">{g.message_content}</p>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span>Reporter: {g.subscriber_name ?? 'Anonymous'} · {g.reporter}</span>
        <span>Filed: {new Date(g.created_at).toLocaleString()}</span>
        <span>Category: {g.category}</span>
        <span>Matched by: {g.match_method.replace(/_/g, ' ').toLowerCase()}</span>
        {g.highlighted_url && <span className="break-all text-rose-700">URL: {g.highlighted_url}</span>}
        {g.highlighted_phone && <span>Phone: {g.highlighted_phone}</span>}
        {g.attachment_path && (
          <a className="font-semibold text-blue-700 hover:underline" target="_blank" rel="noreferrer"
            href={`/api/grievances/attachment?id=${g.id}`}>{g.attachment_name ?? 'Screenshot'}</a>
        )}
      </div>

      {g.escalated_at && (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <strong>Escalated {g.escalated_by_role ? `by the ${g.escalated_by_role.replace(/_/g, ' ').toLowerCase()}` : 'by the enterprise'}</strong>
          {' '}on {new Date(g.escalated_at).toLocaleString()}.
          {g.escalation_reason && <span className="mt-1 block">Reason given: {g.escalation_reason}</span>}
        </div>
      )}

      {(g.reopen_count ?? 0) > 0 && (
        <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Re-opened by the reporter {(g.reopen_count ?? 0) === 1 ? 'once' : `${g.reopen_count} times`}
          {g.reopened_at ? <> — latest on {new Date(g.reopened_at).toLocaleString()}</> : null}.
          {g.reopen_reason && <span className="mt-1 block">Reason given: {g.reopen_reason}</span>}
        </div>
      )}

      {g.return_reason && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Returned to the enterprise on {g.returned_at ? new Date(g.returned_at).toLocaleString() : '—'}.
          <span className="mt-1 block">Your note: {g.return_reason}</span>
        </div>
      )}

      {g.resolution_remarks && <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Outcome: {g.resolution_remarks}</div>}

      {actions.length === 0 ? (
        <p className="text-xs text-slate-500">
          {GRIEVANCE_CONCLUDED.includes(g.status)
            ? `This grievance is ${GRIEVANCE_STATUS_LABELS[g.status].toLowerCase()} — the reporter can still re-open it.`
            : `This grievance is with the enterprise (${GRIEVANCE_STATUS_LABELS[g.status].toLowerCase()}) — it will appear here if escalated.`}
        </p>
      ) : (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div>
            <label className="label">{tr("Note (required, min 5 characters)")}</label>
            <input className={`input ${tooShort ? 'border-rose-300 ring-1 ring-rose-200' : ''}`}
              value={remarks}
              placeholder={tr("Reason for returning, or the ruling you are recording")}
              onChange={(e) => { setRemarks(e.target.value); setTouched(false); }} />
            {tooShort && <p className="mt-1 text-xs text-rose-600">{tr("Add a short note before you continue.")}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((a) => (
              <button key={a} className={BTN[a]} disabled={busy} onClick={() => run(a)}>
                {tr(GRIEVANCE_ACTION_LABELS[a])}
              </button>
            ))}
            {busy && <span className="text-xs text-slate-500">{tr("Saving…")}</span>}
          </div>
          <p className="text-[11px] text-slate-500">
            Returning the case sends it back to the enterprise with your note and restarts its SLA clock.
          </p>
        </div>
      )}
    </div>
  );
}
