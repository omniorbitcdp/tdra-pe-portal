'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty, StatCard, StatGrid, Stepper, SectionTitle } from '@/components/ui';
import { Loader, ErrorBox } from '@/components/nav';
import { MANDATORY_DOC_TYPES, DOC_TYPE_LABELS } from '@/lib/constants';

interface Doc { id: string; doc_type: string; status: string; remarks: string | null }
interface Entity { legal_entity_name: string; entity_code: string | null; entity_type: string; kyc_status: string; kyc_info_approved: boolean }
interface Rec { id: string; status: string }
interface Data {
  entity: Entity | null;
  kyc: { status: string; documents: Doc[]; complete: boolean };
  headers: Rec[]; templates: Rec[]; urls: Rec[];
  history: Array<{ id: number; module: string; action: string; to_status: string | null; remarks: string | null; created_at: string; actor_name?: string | null; actor_email: string | null }>;
}

export default function PeDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Data>('/api/pe/dashboard').then((r) => { if (!r.ok) setError(r.data.error); else setData(r.data as unknown as Data); }); }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loader />;
  if (!data.entity) {
    return (
      <div>
        <PageHeader title="Welcome" subtitle="Let's get your business registered." />
        <Card>
          <h2 className="text-lg font-semibold">Step 1 — complete your entity details</h2>
          <p className="mt-2 text-sm text-slate-600">Then upload your four TDRA documents and submit the pack for review.</p>
          <a className="btn-primary mt-4 inline-flex" href="/pe/profile">Start registration</a>
        </Card>
      </div>
    );
  }

  const e = data.entity;
  const docs = new Map(data.kyc.documents.map((d) => [d.doc_type, d]));
  const verified = MANDATORY_DOC_TYPES.filter((t) => docs.get(t)?.status === 'VERIFIED').length;
  const uploaded = MANDATORY_DOC_TYPES.filter((t) => docs.has(t)).length;
  const latest = (list: Rec[]) => list.some((x) => x.status === 'APPROVED') ? 'APPROVED'
    : list.some((x) => ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(x.status)) ? 'SUBMITTED'
    : list.some((x) => x.status === 'REJECTED') ? 'REJECTED'
    : list.some((x) => x.status === 'CLARIFICATION_REQUIRED') ? 'CLARIFICATION_REQUIRED' : 'NOT_STARTED';

  const headerStatus = latest(data.headers);
  const templateStatus = latest(data.templates);
  const urlStatus = latest(data.urls);

  const steps = [
    { label: 'KYC approved', status: e.kyc_status, ok: e.kyc_status === 'APPROVED', href: '/pe/kyc', note: `PE ID ${e.entity_code ?? '—'}` },
    { label: 'Header approved', status: headerStatus, ok: headerStatus === 'APPROVED', href: '/pe/headers', note: `${data.headers.length} request(s)` },
    { label: 'Template approved', status: templateStatus, ok: templateStatus === 'APPROVED', href: '/pe/templates', note: `${data.templates.length} request(s)` },
    { label: 'URL approved', status: urlStatus, ok: urlStatus === 'APPROVED', href: '/pe/urls', note: `${data.urls.length} request(s)` },
  ];

  const nextAction = !e.kyc_info_approved || e.kyc_status !== 'APPROVED'
    ? { label: uploaded < 4 ? 'Upload your KYC documents' : (['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(e.kyc_status) ? 'KYC is with the operator for review' : 'Submit your KYC pack for review'), href: '/pe/kyc' }
    : headerStatus !== 'APPROVED' ? { label: 'Register a header', href: '/pe/headers' }
    : templateStatus !== 'APPROVED' ? { label: 'Register a template', href: '/pe/templates' }
    : urlStatus !== 'APPROVED' ? { label: 'Register a URL', href: '/pe/urls' }
    : { label: 'All set — every stage is approved', href: '/pe' };

  return (
    <div>
      <PageHeader title={e.legal_entity_name}
        subtitle={`${e.entity_type} · KYC ${e.kyc_status.replace(/_/g, ' ')}`}
        actions={<a className="btn-ghost" href="/pe/profile">Edit details</a>} />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Your PE ID</span>
        <span className="font-mono text-xl font-bold brand-text">{e.entity_code ?? '—'}</span>
        <span className="text-xs text-slate-500">Quote this in every request to the operator</span>
      </div>

      <Card className="mb-6 border-l-4" >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Your next step</div>
            <div className="mt-1 text-base font-semibold text-slate-800">{nextAction.label}</div>
          </div>
          <a className="btn-primary" href={nextAction.href}>Go to step</a>
        </div>
      </Card>

      <SectionTitle>Registration progress</SectionTitle>
      <Card><Stepper steps={steps} /></Card>

      <SectionTitle>At a glance</SectionTitle>
      <StatGrid cols={4}>
        <StatCard label="Documents verified" value={`${verified}/4`} tone={verified === 4 ? 'emerald' : 'amber'} hint={`${uploaded} uploaded`} />
        <StatCard label="Headers" value={data.headers.length} hint={headerStatus.replace(/_/g, ' ')} href="/pe/headers" />
        <StatCard label="Templates" value={data.templates.length} hint={templateStatus.replace(/_/g, ' ')} href="/pe/templates" />
        <StatCard label="URLs" value={data.urls.length} hint={urlStatus.replace(/_/g, ' ')} href="/pe/urls" />
      </StatGrid>

      <SectionTitle right={<a className="btn-ghost btn-sm" href="/pe/kyc">Manage documents</a>}>KYC document pack</SectionTitle>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MANDATORY_DOC_TYPES.map((t) => {
            const d = docs.get(t);
            return (
              <div key={t} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">{DOC_TYPE_LABELS[t]}</div>
                <div className="mt-2"><StatusPill status={d ? d.status : 'NOT_STARTED'} /></div>
                {d?.remarks && <p className="mt-2 text-[11px] text-amber-700">{d.remarks}</p>}
              </div>
            );
          })}
        </div>
      </Card>

      <SectionTitle>History</SectionTitle>
      <Card className="overflow-hidden p-0">
        {data.history.length === 0 ? <div className="p-5"><Empty>No activity yet.</Empty></div> : (
          <table className="table">
            <thead className="thead-row"><tr>
              <th className="th">When</th><th className="th">Module</th><th className="th">Action</th>
              <th className="th">Status</th><th className="th">By</th><th className="th">Remarks</th>
            </tr></thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id} className="tr">
                  <td className="td whitespace-nowrap text-xs text-slate-500">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="td text-xs">{h.module}</td>
                  <td className="td text-xs font-medium">{h.action.replace(/_/g, ' ')}</td>
                  <td className="td">{h.to_status ? <StatusPill status={h.to_status} /> : '—'}</td>
                  <td className="td text-xs">{h.actor_name ?? h.actor_email ?? 'System'}</td>
                  <td className="td max-w-[280px] text-xs text-slate-500">{h.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
