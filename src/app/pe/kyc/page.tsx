'use client';
import { useEffect, useState } from 'react';
import { api, apiForm } from '@/lib/client';
import { PageHeader, Card, StatusPill } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { MANDATORY_DOC_TYPES, DOC_TYPE_LABELS, DEFAULT_MAX_KYC_FILE_MB } from '@/lib/constants';

interface Doc { id: string; doc_type: string; file_name: string; status: string; remarks: string | null; size_bytes: number }

export default function KycPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [maxMb, setMaxMb] = useState(DEFAULT_MAX_KYC_FILE_MB);

  async function load() {
    const r = await api<{ documents: Doc[] }>('/api/pe/kyc');
    if (!r.ok) setError(r.data.error); else setDocs((r.data as unknown as { documents: Doc[] }).documents ?? []);
    setLoaded(true);
  }
  useEffect(() => { load(); api<{ settings: { maxKycFileMb: number } }>('/api/admin/settings').then((r) => { if (r.ok) setMaxMb((r.data as unknown as { settings: { maxKycFileMb: number } }).settings.maxKycFileMb); }); }, []);

  async function upload(docType: string, file: File) {
    setBusy(docType); setError(''); setNotice('');
    const fd = new FormData(); fd.append('doc_type', docType); fd.append('file', file);
    const res = await apiForm('/api/pe/kyc', fd);
    setBusy('');
    if (!res.ok) { setError(res.data.error ?? 'Upload failed'); return; }
    setNotice(`${DOC_TYPE_LABELS[docType as keyof typeof DOC_TYPE_LABELS]} uploaded.`);
    await load();
  }

  async function view(docId: string) {
    const r = await api<{ url: string }>(`/api/pe/kyc/file?docId=${docId}`);
    if (!r.ok) { setError(r.data.error); return; }
    window.open((r.data as unknown as { url: string }).url, '_blank', 'noopener');
  }

  if (!loaded) return <Loader />;
  const byType = new Map(docs.map((d) => [d.doc_type, d]));

  return (
    <div>
      <PageHeader title="TDRA KYC Documents" subtitle="Section 5 — all four documents are mandatory for the TDRA pack" />
      <ErrorBox message={error} />
      <Notice message={notice} />
      <div className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-xs text-slate-600">Allowed formats: PDF, JPG, JPEG, PNG · Max {maxMb} MB per document · Files are validated on the server (type, extension and size).</div>
      <div className="grid gap-4 md:grid-cols-2">
        {MANDATORY_DOC_TYPES.map((t) => {
          const d = byType.get(t);
          return (
            <Card key={t}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{DOC_TYPE_LABELS[t]}</div>
                  <div className="mt-1 text-xs text-slate-400">{d ? `${d.file_name} · ${(d.size_bytes / 1024 / 1024).toFixed(2)} MB` : 'Not uploaded'}</div>
                </div>
                <StatusPill status={d?.status ?? 'NOT_STARTED'} />
              </div>
              {d?.remarks && <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{d.remarks}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="btn-ghost cursor-pointer">
                  {busy === t ? 'Uploading…' : d ? 'Replace / resubmit' : 'Upload'}
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(t, f); e.target.value = ''; }} />
                </label>
                {d && <button type="button" className="btn-ghost" onClick={() => view(d.id)}>Preview</button>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
