'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox } from '@/components/nav';
import { MANDATORY_DOC_TYPES, DOC_TYPE_LABELS } from '@/lib/constants';

interface Doc { id: string; doc_type: string; status: string; remarks: string | null }
interface Data {
  entity: { legal_entity_name: string; entity_type: string; kyc_status: string; kyc_info_approved: boolean } | null;
  kyc: { status: string; documents: Doc[]; complete: boolean };
  headers: Array<{ id: string; header_name: string; status: string }>;
  templates: Array<{ id: string; template_name: string; status: string }>;
  urls: Array<{ id: string; url: string; status: string }>;
  history: Array<{ id: number; module: string; action: string; to_status: string | null; remarks: string | null; created_at: string; actor_email: string | null }>;
}

export default function PeDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Data>('/api/pe/dashboard').then((r) => { if (!r.ok) setError(r.data.error); else setData(r.data as unknown as Data); }); }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loader />;
  if (!data.entity) return <Card><h2 className="text-lg font-semibold">Welcome</h2><p className="mt-2 text-sm text-slate-600">Start by completing your <a className="brand-text font-semibold" href="/pe/profile">entity &amp; signatory details</a>, then upload your KYC documents.</p></Card>;

  const docs = new Map(data.kyc.documents.map((d) => [d.doc_type, d]));
  const steps = [
    { label: 'KYC approval', ok: data.entity.kyc_status === 'APPROVED', status: data.entity.kyc_status },
    { label: 'Header approved', ok: data.headers.some((h) => h.status === 'APPROVED'), status: data.headers.some((h) => h.status === 'APPROVED') ? 'APPROVED' : (data.headers[0]?.status ?? 'NOT_STARTED') },
    { label: 'Template approved', ok: data.templates.some((t) => t.status === 'APPROVED'), status: data.templates.some((t) => t.status === 'APPROVED') ? 'APPROVED' : (data.templates[0]?.status ?? 'NOT_STARTED') },
    { label: 'URL approved', ok: data.urls.some((u) => u.status === 'APPROVED'), status: data.urls.some((u) => u.status === 'APPROVED') ? 'APPROVED' : (data.urls[0]?.status ?? 'NOT_STARTED') },
  ];

  return (
    <div>
      <PageHeader title={data.entity.legal_entity_name} subtitle={`${data.entity.entity_type} · KYC ${data.entity.kyc_status.replace(/_/g, ' ')}`} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Card key={s.label}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.label}</div>
            <div className={`mt-2 flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold ${s.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{s.ok ? '✓' : '•'}</div>
            <div className="mt-2"><StatusPill status={s.status} /></div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">KYC document pack</h2>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MANDATORY_DOC_TYPES.map((t) => {
            const d = docs.get(t);
            return (
              <div key={t} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">{DOC_TYPE_LABELS[t]}</div>
                <div className="mt-2">{d ? <StatusPill status={d.status} /> : <StatusPill status="NOT_STARTED" />}</div>
                {d?.remarks && <p className="mt-2 text-xs text-amber-700">{d.remarks}</p>}
              </div>
            );
          })}
        </div>
        <a className="btn-primary mt-4 inline-flex" href="/pe/kyc">Manage KYC documents</a>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">History</h2>
      <Card className="overflow-x-auto">
        {data.history.length === 0 ? <Empty>No activity yet.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">When</th><th className="th">Module</th><th className="th">Action</th><th className="th">To status</th><th className="th">Remarks</th></tr></thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id}>
                  <td className="td whitespace-nowrap">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="td">{h.module}</td>
                  <td className="td">{h.action}</td>
                  <td className="td">{h.to_status ? <StatusPill status={h.to_status} /> : '—'}</td>
                  <td className="td">{h.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
