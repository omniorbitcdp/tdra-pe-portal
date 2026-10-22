'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api, apiForm } from '@/lib/client';
import { PageHeader, Card, StatusPill } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { MANDATORY_DOC_TYPES, DOC_TYPE_LABELS, DEFAULT_MAX_KYC_FILE_MB } from '@/lib/constants';

interface Doc { id: string; doc_type: string; file_name: string; status: string; remarks: string | null; size_bytes: number }
interface Entity { entity_code: string | null; kyc_status: string; legal_entity_name: string | null; entity_type: string | null; trade_licence_number: string | null; registered_address: string | null; emirate: string | null; city: string | null; industry: string | null; business_description: string | null; signatory_name: string | null; signatory_designation: string | null; official_email: string | null; mobile: string | null }

const FIELD_LABELS: Array<[keyof Entity, string]> = [
  ['legal_entity_name', 'Legal entity name'], ['entity_type', 'Entity type'], ['trade_licence_number', 'Trade licence number'],
  ['registered_address', 'Registered address'], ['emirate', 'State / Emirate'], ['city', 'City'], ['industry', 'Industry / sector'],
  ['business_description', 'Business description'], ['signatory_name', 'Signatory full name'], ['signatory_designation', 'Signatory designation'],
  ['official_email', 'Official email'], ['mobile', 'Mobile number'],
];

export default function KycPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(''); const [submitting, setSubmitting] = useState(false);
  const [maxMb, setMaxMb] = useState(DEFAULT_MAX_KYC_FILE_MB);

  async function load() {
    const [r, p] = await Promise.all([api<{ documents: Doc[] }>('/api/pe/kyc'), api<{ entity: Entity | null }>('/api/pe/profile')]);
    if (!r.ok) setError(r.data.error); else setDocs((r.data as unknown as { documents: Doc[] }).documents ?? []);
    if (p.ok) setEntity((p.data as unknown as { entity: Entity | null }).entity);
    setLoaded(true);
  }
  useEffect(() => {
    load();
    api<{ settings: { maxKycFileMb: number } }>('/api/settings').then((r) => { if (r.ok) setMaxMb((r.data as unknown as { settings: { maxKycFileMb: number } }).settings.maxKycFileMb); });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function upload(docType: string, file: File) {
    setBusy(docType); setError(''); setNotice('');
    const fd = new FormData(); fd.append('doc_type', docType); fd.append('file', file);
    const res = await apiForm('/api/pe/kyc', fd);
    setBusy('');
    if (!res.ok) { setError(res.data.error ?? tr('Upload failed')); return; }
    setNotice(`${tr(DOC_TYPE_LABELS[docType as keyof typeof DOC_TYPE_LABELS])} uploaded.`);
    await load();
  }

  async function view(docId: string) {
    const r = await api<{ url: string }>(`/api/pe/kyc/file?docId=${docId}`);
    if (!r.ok) { setError(r.data.error); return; }
    window.open((r.data as unknown as { url: string }).url, '_blank', 'noopener');
  }

  async function submitKyc() {
    setSubmitting(true); setError(''); setNotice('');
    const res = await api<{ status: string; missingFields?: string[]; missingDocuments?: string[] }>('/api/pe/kyc/submit', { method: 'POST' });
    setSubmitting(false);
    if (!res.ok) {
      const d = res.data as unknown as { error: string; missingFields?: string[]; missingDocuments?: string[] };
      setError([d.error, d.missingDocuments?.length ? `Missing documents: ${d.missingDocuments.join(', ')}` : '', d.missingFields?.length ? `Missing fields: ${d.missingFields.join(', ')}` : ''].filter(Boolean).join(' · '));
      return;
    }
    setNotice(tr('KYC pack submitted for review.'));
    await load();
  }

  if (!loaded) return <Loader />;
  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  const uploadedTypes = MANDATORY_DOC_TYPES.filter((t) => byType.has(t));
  const missingTypes = MANDATORY_DOC_TYPES.filter((t) => !byType.has(t));
  const missingFields = entity ? FIELD_LABELS.filter(([k]) => { const v = entity[k]; return typeof v !== 'string' || v.trim() === ''; }).map(([, l]) => l) : FIELD_LABELS.map(([, l]) => l);
  const ready = missingTypes.length === 0 && missingFields.length === 0;
  const st = entity?.kyc_status ?? 'DRAFT';
  const canSubmit = ready && ['DRAFT', 'CLARIFICATION_REQUIRED', 'REJECTED'].includes(st);

  return (
    <div>
      <PageHeader title={tr("TDRA KYC Documents")} subtitle={tr("Section 5 — all four documents are mandatory for the TDRA pack")} />
      <ErrorBox message={error} /><Notice message={notice} />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-slate-500">{tr("KYC submission status")}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3"><StatusPill status={st} /><span className="text-sm text-slate-600">{uploadedTypes.length} of 4 documents uploaded</span><span className="font-mono text-xs text-slate-500">PE ID {entity?.entity_code ?? "—"}</span></div>
          </div>
          {canSubmit && <button className="btn-primary" disabled={submitting} onClick={submitKyc}>{submitting ? 'Submitting…' : st === 'DRAFT' ? 'Submit KYC for review' : 'Resubmit KYC for review'}</button>}
          {!canSubmit && ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(st) && <span className="pill bg-sky-100 text-sky-700">{tr("Awaiting operator review")}</span>}
          {st === 'APPROVED' && <span className="pill bg-emerald-100 text-emerald-700">{tr("KYC approved")}</span>}
        </div>
        {!ready && (
          <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <div className="font-semibold">{tr("Before you can submit:")}</div>
            <ul className="mt-1 list-inside list-disc">
              {missingTypes.length > 0 && <li>Upload: {missingTypes.map((t) => DOC_TYPE_LABELS[t]).join(', ')}</li>}
              {missingFields.length > 0 && <li>{tr("Complete in")} <a className="font-semibold underline" href="/pe/profile">{tr("Entity &amp; Signatory")}</a>: {missingFields.join(', ')}</li>}
            </ul>
          </div>
        )}
      </Card>

      <div className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-xs text-slate-600">Allowed formats: PDF, JPG, JPEG, PNG · Max {maxMb} MB per document · Files are validated on the server (type, extension and size).</div>
      <div className="grid gap-4 md:grid-cols-2">
        {MANDATORY_DOC_TYPES.map((t) => {
          const d = byType.get(t);
          return (
            <Card key={t}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{tr(DOC_TYPE_LABELS[t])}</div>
                  <div className="mt-1 text-xs text-slate-400">{d ? `${d.file_name} · ${(d.size_bytes / 1024 / 1024).toFixed(2)} MB` : tr('Not uploaded')}</div>
                </div>
                <StatusPill status={d?.status ?? 'NOT_STARTED'} />
              </div>
              {d?.remarks && <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{d.remarks}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="btn-ghost cursor-pointer">
                  {busy === t ? tr('Uploading…') : d ? tr('Replace / resubmit') : tr('Upload')}
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(t, f); e.target.value = ''; }} />
                </label>
                {d && <button type="button" className="btn-ghost" onClick={() => view(d.id)}>{tr("Preview")}</button>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
