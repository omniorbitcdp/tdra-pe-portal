'use client';
import { t as tr } from '@/lib/i18n/live';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty, StatCard, StatGrid, Toolbar } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { extractVariables, renderWithSamples, tokenise } from '@/lib/templateVars';

interface Row {
  id: string; entity_name: string; status: string; remarks: string | null;
  header_code?: string | null; template_code?: string | null; url_code?: string | null;
  header_name?: string; sender_id?: string; template_name?: string; category?: string;
  url?: string; submitted_at?: string | null;
  body?: string; variables?: string | null; variable_samples?: Record<string, string> | null;
  [k: string]: unknown;
}
interface Summary {
  module: string; label: string; href: string;
  pending: number; awaitingPe: number; approved: number; rejected: number; draft: number; total: number;
}

type View = 'PENDING' | 'ALL' | 'APPROVED' | 'REJECTED' | 'AWAITING_PE';

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'PENDING', label: 'Awaiting my action' },
  { key: 'AWAITING_PE', label: 'Awaiting PE' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

export function DecisionQueue({ module, title }: { module: 'HEADER' | 'TEMPLATE' | 'URL'; title: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>('PENDING');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function load() {
    const [q, sm] = await Promise.all([
      api<{ queue: Row[] }>(`/api/operator/queue?module=${module}`),
      api<{ modules: Summary[] }>(`/api/operator/summary?module=${module}`),
    ]);
    if (!q.ok) setError(q.data.error); else setRows((q.data as unknown as { queue: Row[] }).queue ?? []);
    if (sm.ok) setSummary(((sm.data as unknown as { modules: Summary[] }).modules ?? [])[0] ?? null);
    setLoaded(true);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [module]);

  async function decide(id: string, action: string) {
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/operator/decision', { method: 'POST', body: JSON.stringify({ module, id, action, remarks: remarks[id] ?? '' }) });
    setBusyId('');
    if (!res.ok) { setError(res.data.error ?? 'Failed'); return; }
    setNotice(`${module.charAt(0)}${module.slice(1).toLowerCase()} ${action.toLowerCase().replace('_', ' ')} recorded.`);
    await load();
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      const s = r.status;
      const inView =
        view === 'ALL' ? true
        : view === 'PENDING' ? ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(s)
        : view === 'AWAITING_PE' ? s === 'CLARIFICATION_REQUIRED'
        : view === 'APPROVED' ? s === 'APPROVED'
        : s === 'REJECTED';
      if (!inView) return false;
      if (!needle) return true;
      return [r.entity_name, r.header_code, r.template_code, r.url_code, r.header_name, r.template_name, r.sender_id, r.url, r.status]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, view, search]);

  if (!loaded) return <Loader />;
  const actionable = (s: string) => ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(s);
  const detail = (r: Row) => module === 'HEADER'
    ? <div><div className="font-medium text-slate-800">{r.header_name}</div><div className="text-xs text-slate-400">Sender ID {r.sender_id} · {String(r.header_type ?? '')}</div></div>
    : module === 'TEMPLATE'
      ? <div><div className="font-medium text-slate-800">{r.template_name}</div><div className="text-xs text-slate-400">{r.category} · SMS</div><button className="mt-1 text-xs font-semibold text-blue-700 hover:underline" onClick={() => setOpen({ ...open, [r.id]: !open[r.id] })}>{open[r.id] ? 'Hide message' : 'View message & sample content'}</button></div>
      : <div className="max-w-[420px]"><div className="break-all font-medium text-slate-800">{r.url}</div><div className="text-xs text-slate-400">{String(r.method ?? '')} · {String(r.callback_type ?? '')}</div></div>;

  return (
    <div>
      <PageHeader title={title} subtitle={tr("Approve, reject or return a request for correction. Remarks are mandatory for rejection and correction.")} />
      <ErrorBox message={error} /><Notice message={notice} />

      {summary && (
        <StatGrid cols={5}>
          <StatCard label={tr("Awaiting my action")} value={summary.pending} tone="amber" href="#" />
          <StatCard label={tr("Awaiting PE")} value={summary.awaitingPe} tone="sky" />
          <StatCard label={tr("Approved")} value={summary.approved} tone="emerald" />
          <StatCard label={tr("Rejected")} value={summary.rejected} tone="rose" />
          <StatCard label={tr("Total requests")} value={summary.total} />
        </StatGrid>
      )}

      <Card className="mt-5 overflow-hidden p-0">
        <Toolbar>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${view === v.key ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {v.label}
              </button>
            ))}
            <input className="input ml-auto max-w-xs" placeholder={tr("Search entity, ID, status…")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Toolbar>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? <div className="px-5 pb-5"><Empty>{tr("Nothing in this view.")}</Empty></div> : (
            <table className="table">
              <thead className="thead-row"><tr>
                <th className="th">ID</th><th className="th">{tr("Entity")}</th><th className="th">{tr("Request")}</th>
                <th className="th">{tr("Status")}</th><th className="th">{tr("Last remarks")}</th><th className="th">{tr("Decision")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <Fragment key={r.id}>
                  <tr key={r.id} className="tr">
                    <td className="td whitespace-nowrap font-mono text-xs">{String(r.header_code ?? r.template_code ?? r.url_code ?? '—')}</td>
                    <td className="td font-medium">{r.entity_name}</td>
                    <td className="td">{detail(r)}</td>
                    <td className="td"><StatusPill status={r.status} /></td>
                    <td className="td max-w-[220px] text-xs text-slate-500">{r.remarks ?? '—'}</td>
                    <td className="td">
                      {actionable(r.status) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input className="input max-w-[190px]" placeholder={tr("Remarks…")} value={remarks[r.id] ?? ''} onChange={(e) => setRemarks({ ...remarks, [r.id]: e.target.value })} />
                          <button className="btn-success btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'APPROVE')}>{tr("Approve")}</button>
                          <button className="btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'REQUEST_CORRECTION')}>{tr("Correction")}</button>
                          <button className="btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'REJECT')}>{tr("Reject")}</button>
                        </div>
                      ) : <span className="text-xs text-slate-400">{tr("No action available")}</span>}
                    </td>
                  </tr>
                  {module === 'TEMPLATE' && open[r.id] && (
                    <tr className="tr">
                      <td className="td bg-slate-50" colSpan={6}>
                        <TemplatePreview body={String(r.body ?? '')} samples={(r.variable_samples ?? {}) as Record<string, string>} />
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

/** The SMS exactly as the subscriber receives it, with every variable and the
 *  sample content the PE declared. */
function TemplatePreview({ body, samples }: { body: string; samples: Record<string, string> }) {
  const vars = extractVariables(body);
  return (
    <div className="space-y-3 py-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("SMS template body")}</div>
      <p className="whitespace-pre-wrap text-sm text-slate-800">
        {tokenise(body).map((p, i) => p.isVar
          ? <span key={i} className="rounded bg-blue-50 px-1 font-mono text-xs text-blue-700 ring-1 ring-blue-200">{p.text}</span>
          : <span key={i}>{p.text}</span>)}
      </p>

      {vars.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("Variables &amp; sample content")}</div>
          <table className="mt-1 w-full max-w-xl">
            <thead><tr><th className="th">{tr("Variable")}</th><th className="th">{tr("Sample content")}</th></tr></thead>
            <tbody>
              {vars.map((v) => (
                <tr key={v}>
                  <td className="td font-mono text-xs text-blue-700">&lt;{v}&gt;</td>
                  <td className="td text-xs">{samples[v] ? samples[v] : <span className="text-rose-600">{tr("not provided")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded border border-blue-100 bg-blue-50/50 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{tr("As received by the subscriber")}</div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{renderWithSamples(body, samples)}</p>
      </div>
    </div>
  );
}
