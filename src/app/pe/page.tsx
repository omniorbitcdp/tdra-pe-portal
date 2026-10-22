'use client';
import { t as tr } from '@/lib/i18n/live';
import { STATUS_LABELS } from '@/lib/labels';
import { fmtDateTime } from '@/lib/datetime';
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
        <PageHeader title={tr("Welcome")} subtitle="Let's get your business registered." />
        <Card>
          <h2 className="text-lg font-semibold">{tr("Step 1 — complete your entity details")}</h2>
          <p className="mt-2 text-sm text-slate-600">{tr("Then upload your four TDRA documents and submit the pack for review.")}</p>
          <a className="btn-primary mt-4 inline-flex" href="/pe/profile">{tr("Start registration")}</a>
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
    { label: tr('KYC approved'), status: e.kyc_status, ok: e.kyc_status === 'APPROVED', href: '/pe/kyc', note: `PE ID ${e.entity_code ?? '—'}` },
    { label: tr('Header approved'), status: headerStatus, ok: headerStatus === 'APPROVED', href: '/pe/headers', note: tr('{n} request(s)', { n: data.headers.length }) },
    { label: tr('Template approved'), status: templateStatus, ok: templateStatus === 'APPROVED', href: '/pe/templates', note: tr('{n} request(s)', { n: data.templates.length }) },
    { label: tr('URL approved'), status: urlStatus, ok: urlStatus === 'APPROVED', href: '/pe/urls', note: tr('{n} request(s)', { n: data.urls.length }) },
  ];

  const nextAction = !e.kyc_info_approved || e.kyc_status !== 'APPROVED'
    ? { label: uploaded < 4 ? tr('Upload your KYC documents') : (['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(e.kyc_status) ? tr('KYC is with the operator for review') : 'Submit your KYC pack for review'), href: '/pe/kyc' }
    : headerStatus !== 'APPROVED' ? { label: tr('Register a header'), href: '/pe/headers' }
    : templateStatus !== 'APPROVED' ? { label: tr('Register a template'), href: '/pe/templates' }
    : urlStatus !== 'APPROVED' ? { label: tr('Register a URL'), href: '/pe/urls' }
    : { label: tr('All set — every stage is approved'), href: '/pe' };

  return (
    <div>
      <PageHeader title={e.legal_entity_name}
        subtitle={`${tr(e.entity_type)} · KYC ${e.kyc_status.replace(/_/g, ' ')}`}
        actions={<a className="btn-ghost" href="/pe/profile">{tr("Edit details")}</a>} />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr("Your PE ID")}</span>
        <span className="font-mono text-xl font-bold brand-text">{e.entity_code ?? '—'}</span>
        <span className="text-xs text-slate-500">{tr("Quote this in every request to the operator")}</span>
      </div>

      <Card className="mb-6 border-l-4" >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr("Your next step")}</div>
            <div className="mt-1 text-base font-semibold text-slate-800">{nextAction.label}</div>
          </div>
          <a className="btn-primary" href={nextAction.href}>{tr("Go to step")}</a>
        </div>
      </Card>

      <SectionTitle>{tr("Registration progress")}</SectionTitle>
      <Card><Stepper steps={steps} /></Card>

      <SectionTitle>{tr("At a glance")}</SectionTitle>
      <StatGrid cols={4}>
        <StatCard label={tr("Documents verified")} value={`${verified}/4`} tone={verified === 4 ? 'emerald' : 'amber'} hint={tr('{uploaded} uploaded', { uploaded: uploaded })} />
        <StatCard label={tr("Headers")} value={data.headers.length} hint={headerStatus.replace(/_/g, ' ')} href="/pe/headers" />
        <StatCard label={tr("Templates")} value={data.templates.length} hint={templateStatus.replace(/_/g, ' ')} href="/pe/templates" />
        <StatCard label={tr("URLs")} value={data.urls.length} hint={urlStatus.replace(/_/g, ' ')} href="/pe/urls" />
      </StatGrid>

      <SectionTitle right={<a className="btn-ghost btn-sm" href="/pe/kyc">{tr("Manage documents")}</a>}>{tr("KYC document pack")}</SectionTitle>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MANDATORY_DOC_TYPES.map((t) => {
            const d = docs.get(t);
            return (
              <div key={t} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">{tr(DOC_TYPE_LABELS[t])}</div>
                <div className="mt-2"><StatusPill status={d ? d.status : 'NOT_STARTED'} /></div>
                {d?.remarks && <p className="mt-2 text-[11px] text-amber-700">{d.remarks}</p>}
              </div>
            );
          })}
        </div>
      </Card>

      <SectionTitle>{tr("History")}</SectionTitle>
      <Card className="overflow-hidden p-0">
        {data.history.length === 0 ? <div className="p-5"><Empty>{tr("No activity yet.")}</Empty></div> : (
          <table className="table">
            <thead className="thead-row"><tr>
              <th className="th">{tr("When")}</th><th className="th">{tr("Module")}</th><th className="th">{tr("Action")}</th>
              <th className="th">{tr("Status")}</th><th className="th">{tr("By")}</th><th className="th">{tr("Remarks")}</th>
            </tr></thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id} className="tr">
                  <td className="td whitespace-nowrap text-xs text-slate-500"><span className="ltr-inline">{fmtDateTime(h.created_at)}</span></td>
                  <td className="td text-xs">{tr(h.module)}</td>
                  <td className="td text-xs font-medium">{tr(h.action.replace(/_/g, ' '))}</td>
                  <td className="td">{h.to_status ? <StatusPill status={h.to_status} /> : '—'}</td>
                  <td className="td text-xs">{h.actor_name ?? h.actor_email ?? tr('System')}</td>
                  <td className="td max-w-[280px] text-xs text-slate-500" dir="auto">{h.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
