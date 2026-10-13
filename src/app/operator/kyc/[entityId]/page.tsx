'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, KeyVal } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { MANDATORY_DOC_TYPES, DOC_TYPE_LABELS, DOC_STATUSES } from '@/lib/constants';

interface Doc { id: string; doc_type: string; file_name: string; status: string; remarks: string | null }
interface Entity { id: string; legal_entity_name: string; kyc_status: string; kyc_info_approved: boolean; [k: string]: unknown }
interface Data { entity: Entity; documents: Doc[]; packComplete: boolean; users: Array<{ email: string; full_name: string | null; status: string }>; history: Array<{ id: number; action: string; remarks: string | null; actor_email: string | null; created_at: string }> }

export default function KycReview() {
  const { entityId } = useParams<{ entityId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [docRemarks, setDocRemarks] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() { const r = await api<Data>(`/api/operator/kyc?entityId=${entityId}`); if (!r.ok) setError(r.data.error); else setData(r.data as unknown as Data); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entityId]);

  async function setDocStatus(docId: string, status: string) {
    setError(''); setNotice('');
    const res = await api('/api/operator/document', { method: 'POST', body: JSON.stringify({ docId, status, remarks: docRemarks[docId] ?? '' }) });
    if (!res.ok) { setError(res.data.error ?? 'Could not update document'); return; }
    setNotice('Document status updated.'); await load();
  }
  async function openDoc(docId: string) {
    const r = await api<{ url: string; document: Doc }>(`/api/pe/kyc/file?docId=${docId}`);
    if (!r.ok) { setError(r.data.error); return; }
    const d = (r.data as unknown as { url: string; document: Doc }).document;
    setPreview({ url: (r.data as unknown as { url: string }).url, type: d.file_name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image', name: d.file_name });
  }
  async function approveInfo(approve: boolean) {
    const res = await api('/api/operator/kyc-info', { method: 'POST', body: JSON.stringify({ entityId, approve }) });
    if (!res.ok) setError(res.data.error ?? 'Failed'); else { setNotice(approve ? 'PE information approved.' : 'PE information marked not approved.'); await load(); }
  }
  async function decide(action: string) {
    setBusy(true); setError(''); setNotice('');
    const res = await api('/api/operator/decision', { method: 'POST', body: JSON.stringify({ module: 'KYC', id: entityId, action, remarks: remarks.KYC ?? '' }) });
    setBusy(false);
    if (!res.ok) { setError(res.data.error ?? 'Failed'); return; }
    setNotice(`KYC ${action.toLowerCase().replace('_', ' ')} recorded.`); await load();
  }

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Loader />;
  const e = data.entity;
  const byType = new Map(data.documents.map((d) => [d.doc_type, d]));
  // DRAFT / CLARIFICATION_REQUIRED / REJECTED means the PE has not (re)submitted.
  const notSubmitted = ['DRAFT', 'CLARIFICATION_REQUIRED', 'REJECTED'].includes(String(e.kyc_status));

  return (
    <div>
      <PageHeader title={`KYC Review — ${e.legal_entity_name}`} subtitle="Left: submitted PE details · Right: document viewer and verification" actions={<a className="btn-ghost" href="/operator/kyc">← Queue</a>} />
      <ErrorBox message={error} /><Notice message={notice} />
      <div className="grid gap-5 lg:grid-cols-2">
        {/* LEFT: PE details */}
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Submitted PE details</h2>
            <div className="grid grid-cols-2 gap-4">
              <KeyVal label="PE ID" value={<span className="font-mono font-semibold brand-text">{String(e.entity_code ?? '—')}</span>} />
              <KeyVal label="Legal entity name" value={String(e.legal_entity_name)} />
              <KeyVal label="Entity type" value={String(e.entity_type)} />
              <KeyVal label="Trade licence" value={String(e.trade_licence_number ?? '—')} />
              <KeyVal label="Licence authority" value={String(e.trade_licence_authority ?? '—')} />
              <KeyVal label="VAT TRN" value={String(e.vat_trn ?? '—')} />
              <KeyVal label="Emirate / City" value={`${e.emirate ?? '—'} / ${e.city ?? '—'}`} />
              <KeyVal label="Industry" value={String(e.industry ?? '—')} />
              <KeyVal label="Signatory" value={`${e.signatory_name ?? '—'} (${e.signatory_designation ?? '—'})`} />
              <KeyVal label="Official email" value={String(e.official_email ?? '—')} />
              <KeyVal label="Mobile" value={String(e.mobile ?? '—')} />
              <div className="col-span-2"><KeyVal label="Registered address" value={String(e.registered_address ?? '—')} /></div>
              <div className="col-span-2"><KeyVal label="Business description" value={String(e.business_description ?? '—')} /></div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm">PE information approved</span>
              <div className="flex items-center gap-2">
                <StatusPill status={e.kyc_info_approved ? 'APPROVED' : 'PENDING_VERIFICATION'} />
                <button className="btn-ghost" onClick={() => approveInfo(!e.kyc_info_approved)}>{e.kyc_info_approved ? 'Revoke' : 'Approve info'}</button>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Users on this entity</h2>
            <ul className="space-y-1 text-sm">{data.users.map((u) => <li key={u.email}>{u.email} · {u.full_name} · <StatusPill status={u.status} /></li>)}</ul>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Decision</h2>
            <textarea className="input min-h-[70px]" placeholder="Remarks (required for rejection / correction)" value={remarks.KYC ?? ''} onChange={(ev) => setRemarks({ ...remarks, KYC: ev.target.value })} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-success" disabled={busy || !data.packComplete || !e.kyc_info_approved || notSubmitted} onClick={() => decide('APPROVE')}>Approve KYC</button>
              <button className="btn-ghost" disabled={busy || notSubmitted} onClick={() => decide('REQUEST_CORRECTION')}>Request correction</button>
              <button className="btn-danger" disabled={busy || notSubmitted} onClick={() => decide('REJECT')}>Reject</button>
            </div>
            {notSubmitted && (
              <p className="mt-2 text-xs text-amber-700">
                <strong>Not submitted yet.</strong> This pack is in status <strong>{String(e.kyc_status).replace(/_/g, ' ')}</strong>. It moves to
                <strong> Submitted</strong> only when the Principal Entity presses <strong>Submit KYC for review</strong> on their
                <code className="mx-1 rounded bg-amber-100 px-1">/pe/kyc</code> page — an unsubmitted pack cannot be approved, rejected or returned.
              </p>
            )}
            {!notSubmitted && (!data.packComplete || !e.kyc_info_approved) && <p className="mt-2 text-xs text-amber-700">Approval is blocked until all four documents are verified and the PE information is approved.</p>}
          </Card>
        </div>

        {/* RIGHT: document viewer */}
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Document viewer</h2>
            {preview ? (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>{preview.name}</span><button className="text-rose-600" onClick={() => setPreview(null)}>Close</button></div>
                <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-50">
                  {preview.type === 'pdf'
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <iframe title="preview" src={preview.url} className="h-[400px] w-full" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={preview.url} alt="preview" className="w-full" />}
                </div>
              </div>
            ) : <p className="text-sm text-slate-400">Open a document below to preview it here.</p>}
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Mandatory documents</h2>
            <div className="space-y-3">
              {MANDATORY_DOC_TYPES.map((t) => {
                const d = byType.get(t);
                return (
                  <div key={t} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{DOC_TYPE_LABELS[t]}</div>
                        <div className="text-xs text-slate-400">{d ? d.file_name : 'Not uploaded'}</div>
                      </div>
                      <StatusPill status={d?.status ?? 'NOT_STARTED'} />
                    </div>
                    {d?.remarks && <p className="mt-2 text-xs text-amber-700">{d.remarks}</p>}
                    {d ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button className="btn-ghost" onClick={() => openDoc(d.id)}>Preview</button>
                        <select className="input max-w-[190px]" value={d.status} onChange={(ev) => setDocStatus(d.id, ev.target.value)}>
                          {DOC_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                        </select>
                        <input className="input max-w-[220px]" placeholder="Remarks (for reject/resubmit)" value={docRemarks[d.id] ?? d.remarks ?? ''} onChange={(ev) => setDocRemarks({ ...docRemarks, [d.id]: ev.target.value })} />
                      </div>
                    ) : <p className="mt-2 text-xs text-amber-700">Missing — the PE must upload this document.</p>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">History</h2>
            <ul className="space-y-2 text-xs">{data.history.map((h) => (
              <li key={h.id} className="border-b border-slate-100 pb-2"><span className="font-semibold">{h.action}</span> · {h.actor_email ?? 'system'} · {new Date(h.created_at).toLocaleString()}{h.remarks ? ` — ${h.remarks}` : ''}</li>
            ))}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
