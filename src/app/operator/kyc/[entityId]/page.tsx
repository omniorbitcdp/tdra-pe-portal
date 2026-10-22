'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, KeyVal, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { MANDATORY_DOC_TYPES, DOC_TYPE_LABELS, DOC_STATUSES } from '@/lib/constants';

interface Doc { id: string; doc_type: string; file_name: string; status: string; remarks: string | null }
interface Entity { id: string; entity_code: string | null; legal_entity_name: string; kyc_status: string; kyc_info_approved: boolean; [k: string]: unknown }
interface HistoryRow { id: number; action: string; remarks: string | null; actor_name?: string | null; actor_email: string | null; from_status: string | null; to_status: string | null; created_at: string }
interface Data { entity: Entity; documents: Doc[]; packComplete: boolean; users: Array<{ email: string; full_name: string | null; status: string }>; history: HistoryRow[] }

/** Only the events a reviewer cares about — noise (VIEW, LOGIN, UPLOAD) is hidden. */
const KEY_ACTIONS = ['SUBMIT', 'RESUBMIT', 'APPROVE', 'REJECT', 'REQUEST_CORRECTION', 'APPROVE_INFO', 'REVOKE_INFO', 'VERIFY_DOCUMENT', 'CREATE'];

const ACTION_LABEL: Record<string, string> = {
  SUBMIT: 'Submitted for review', RESUBMIT: 'Resubmitted', APPROVE: 'Approved', REJECT: 'Rejected',
  REQUEST_CORRECTION: 'Correction requested', APPROVE_INFO: 'PE information approved',
  REVOKE_INFO: 'PE information approval revoked', VERIFY_DOCUMENT: 'Document status updated',
  CREATE: 'Created / updated',
};

export default function KycReview() {
  const { entityId } = useParams<{ entityId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [remarks, setRemarks] = useState('');
  const [docRemarks, setDocRemarks] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    const r = await api<Data>(`/api/operator/kyc?entityId=${entityId}`);
    if (!r.ok) setError(r.data.error); else setData(r.data as unknown as Data);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entityId]);

  async function setDocStatus(docId: string, status: string) {
    setError(''); setNotice('');
    const res = await api('/api/operator/document', { method: 'POST', body: JSON.stringify({ docId, status, remarks: docRemarks[docId] ?? '' }) });
    if (!res.ok) { setError(tr(res.data.error ?? 'Could not update document')); return; }
    setNotice(tr('Document status updated.')); await load();
  }
  async function openDoc(docId: string) {
    const r = await api<{ url: string; document: Doc }>(`/api/pe/kyc/file?docId=${docId}`);
    if (!r.ok) { setError(r.data.error); return; }
    const d = (r.data as unknown as { url: string; document: Doc }).document;
    setPreview({ url: (r.data as unknown as { url: string }).url, type: d.file_name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image', name: d.file_name });
  }
  async function approveInfo(approve: boolean) {
    const res = await api('/api/operator/kyc-info', { method: 'POST', body: JSON.stringify({ entityId, approve }) });
    if (!res.ok) setError(tr(res.data.error ?? 'Failed')); else { setNotice(approve ? 'PE information approved.' : 'PE information approval revoked.'); await load(); }
  }
  async function decide(action: string) {
    setBusy(true); setError(''); setNotice('');
    const res = await api('/api/operator/decision', { method: 'POST', body: JSON.stringify({ module: 'KYC', id: entityId, action, remarks }) });
    setBusy(false);
    if (!res.ok) { setError(tr(res.data.error ?? 'Failed')); return; }
    setNotice(`KYC ${action.toLowerCase().replace('_', ' ')} recorded.`); setRemarks(''); await load();
  }

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Loader />;

  const e = data.entity;
  const byType = new Map(data.documents.map((d) => [d.doc_type, d]));
  const verifiedCount = data.documents.filter((d) => d.status === 'VERIFIED').length;
  const notSubmitted = ['DRAFT', 'CLARIFICATION_REQUIRED', 'REJECTED'].includes(String(e.kyc_status));
  const canApprove = !notSubmitted && data.packComplete && e.kyc_info_approved;

  // Key history only; the full trail stays one click away.
  const keyHistory = data.history.filter((h) => KEY_ACTIONS.includes(h.action));
  const shown = (showAll ? keyHistory : keyHistory.slice(0, 5));

  return (
    <div>
      <PageHeader
        title={`KYC Review — ${e.legal_entity_name}`}
        breadcrumb={<a className="font-semibold text-blue-700 hover:underline" href="/operator/kyc">{tr("← Back to KYC queue")}</a>}
        subtitle={`${String(e.entity_code ?? '')} · ${String(e.entity_type ?? '')} · ${verifiedCount}/4 documents verified`}
        actions={<StatusPill status={String(e.kyc_status)} className="text-xs" />}
      />
      <ErrorBox message={error} /><Notice message={notice} />

      {notSubmitted && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{tr("Not submitted yet.")}</strong> {tr("The pack is in")} <strong>{String(e.kyc_status).replace(/_/g, ' ')}</strong>. It becomes
          approvable once the enterprise presses <strong>{tr("Submit KYC for review")}</strong> on <code className="rounded bg-amber-100 px-1">/pe/kyc</code>.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* LEFT: entity details */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{tr("Submitted PE details")}</h2>
              <span className="font-mono text-xs font-bold text-blue-700">{String(e.entity_code ?? '—')}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <KeyVal label={tr("Legal entity name")} value={String(e.legal_entity_name)} />
              <KeyVal label={tr("Entity type")} value={String(e.entity_type ?? '—')} />
              <KeyVal label={tr("Trade licence")} value={String(e.trade_licence_number ?? '—')} />
              <KeyVal label={tr("Licence authority")} value={String(e.trade_licence_authority ?? '—')} />
              <KeyVal label={tr("VAT TRN")} value={String(e.vat_trn ?? '—')} />
              <KeyVal label={tr("Emirate / City")} value={`${e.emirate ?? '—'} / ${e.city ?? '—'}`} />
              <KeyVal label={tr("Industry")} value={String(e.industry ?? '—')} />
              <KeyVal label={tr("Signatory")} value={`${e.signatory_name ?? '—'}`} />
              <KeyVal label={tr("Designation")} value={String(e.signatory_designation ?? '—')} />
              <KeyVal label={tr("Mobile")} value={String(e.mobile ?? '—')} />
              <div className="col-span-2"><KeyVal label={tr("Official email")} value={String(e.official_email ?? '—')} /></div>
              <div className="col-span-2"><KeyVal label={tr("Registered address")} value={String(e.registered_address ?? '—')} /></div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="text-sm">
                <span className="font-semibold text-slate-700">{tr("PE information")}</span>
                <span className="ml-2"><StatusPill status={e.kyc_info_approved ? 'APPROVED' : 'PENDING_VERIFICATION'} /></span>
              </span>
              <button className="btn-ghost btn-sm" onClick={() => approveInfo(!e.kyc_info_approved)}>
                {e.kyc_info_approved ? tr('Revoke') : tr('Approve info')}
              </button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">{tr("Key history")}</h2>
            {shown.length === 0 ? <Empty>{tr("No decisions recorded yet.")}</Empty> : (
              <ol className="space-y-3">
                {shown.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{ACTION_LABEL[h.action] ?? h.action.replace(/_/g, ' ')}</span>
                      <span className="block text-xs text-slate-500">
                        {h.actor_name ?? h.actor_email ?? tr('System')} · {new Date(h.created_at).toLocaleString()}
                      </span>
                      {h.remarks && <span className="mt-0.5 block text-xs text-slate-600">“{h.remarks}”</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {keyHistory.length > 5 && (
              <button className="mt-3 text-xs font-semibold text-blue-700 hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? tr('Show less') : tr('Show all {n} key events', { n: keyHistory.length })}
              </button>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{tr("Decision")}</h2>
            <textarea className="input min-h-[80px]" placeholder={tr("Remarks — required for rejection and correction requests")} value={remarks} onChange={(ev) => setRemarks(ev.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-success" disabled={busy || !canApprove} onClick={() => decide('APPROVE')}>{tr("Approve KYC")}</button>
              <button className="btn-ghost" disabled={busy || notSubmitted} onClick={() => decide('REQUEST_CORRECTION')}>{tr("Request correction")}</button>
              <button className="btn-danger" disabled={busy || notSubmitted} onClick={() => decide('REJECT')}>{tr("Reject")}</button>
            </div>
            {!notSubmitted && !data.packComplete && <p className="mt-2 text-xs text-amber-700">{tr("All four documents must be verified before approving.")}</p>}
            {!notSubmitted && data.packComplete && !e.kyc_info_approved && <p className="mt-2 text-xs text-amber-700">{tr("Approve the PE information above before approving KYC.")}</p>}
          </Card>
        </div>

        {/* RIGHT: document viewer + verification */}
        <div className="space-y-5 lg:col-span-3">
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{tr("Document preview")}</h2>
              {preview && <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setPreview(null)}>{tr("Close")}</button>}
            </div>
            {preview ? (
              <div>
                <div className="bg-slate-50 px-5 py-2 text-xs text-slate-500">{preview.name}</div>
                <div className="max-h-[520px] overflow-auto bg-slate-100 p-3">
                  {preview.type === 'pdf'
                    ? <iframe title={tr("preview")} src={preview.url} className="h-[500px] w-full rounded-lg border border-slate-200 bg-white" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={preview.url} alt={tr("preview")} className="mx-auto max-h-[500px] rounded-lg border border-slate-200 bg-white" />}
                </div>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-400">{tr("Select")} <strong>{tr("Preview")}</strong> {tr("on a document below.")}</div>
            )}
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{tr("Mandatory documents")}</h2>
              <span className={`text-xs font-semibold ${verifiedCount === 4 ? 'text-emerald-600' : 'text-amber-700'}`}>{verifiedCount}/4 verified</span>
            </div>
            <div className="divide-y divide-slate-100">
              {MANDATORY_DOC_TYPES.map((t) => {
                const d = byType.get(t);
                return (
                  <div key={t} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{tr(DOC_TYPE_LABELS[t])}</div>
                        <div className="truncate text-xs text-slate-400">{d ? d.file_name : tr('Not uploaded')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={d?.status ?? 'NOT_STARTED'} />
                        {d && <button className="btn-ghost btn-sm" onClick={() => openDoc(d.id)}>{tr("Preview")}</button>}
                      </div>
                    </div>
                    {d?.remarks && <p className="mt-2 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{d.remarks}</p>}
                    {d ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select className="input max-w-[210px]" value={d.status} onChange={(ev) => setDocStatus(d.id, ev.target.value)}>
                          {DOC_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                        </select>
                        <input className="input max-w-[260px]" placeholder={tr("Remarks (for reject / resubmit)")}
                          value={docRemarks[d.id] ?? d.remarks ?? ''} onChange={(ev) => setDocRemarks({ ...docRemarks, [d.id]: ev.target.value })} />
                      </div>
                    ) : <p className="mt-2 text-xs text-amber-700">{tr("Missing — the PE must upload this document.")}</p>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
