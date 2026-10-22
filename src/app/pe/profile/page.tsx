'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { ENTITY_TYPES, UAE_EMIRATES, INDUSTRIES } from '@/lib/constants';

const EMPTY = {
  legal_entity_name: '', entity_type: '', trade_licence_number: '', trade_licence_authority: '',
  vat_trn: '', company_reg_no: '', registered_address: '', country: 'United Arab Emirates',
  emirate: '', city: '', postal_code: '', website: '', industry: '', business_description: '',
  signatory_name: '', signatory_designation: '', official_email: '', mobile: '', alt_contact: '',
};

export default function ProfilePage() {
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ entity: Record<string, string> | null }>('/api/pe/profile').then((r) => {
      if (r.data.entity) setForm({ ...EMPTY, ...r.data.entity });
      setLoaded(true);
    });
  }, []);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrors({}); setError(''); setNotice('');
    const res = await api('/api/pe/profile', { method: 'PUT', body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? tr('Could not save')); return; }
    setNotice(tr('Entity details saved.'));
  }

  if (!loaded) return <Loader />;

  const F = (label: string, key: string, type = 'text', opts?: string[]) => (
    <div>
      <label className="label">{label}</label>
      {opts ? (
        <select className="input" value={form[key]} onChange={(e) => set(key, e.target.value)}>
          <option value="">{tr("Select…")}</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className="input" value={form[key]} onChange={(e) => set(key, e.target.value)} />
      )}
      {errors[key] && <p className="mt-1 text-xs text-rose-600">{errors[key]}</p>}
    </div>
  );

  return (
    <div>
      <PageHeader title={tr("Entity & Signatory Details")} subtitle={tr("Section 4.1 and 4.2 — baseline registration fields")} />
      <ErrorBox message={error} />
      <Notice message={notice} />
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("PE ID")}</span>
            <span className="font-mono text-sm font-bold brand-text">{form.entity_code || "assigned on first save"}</span>
          </div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{tr("Entity and business details")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {F('Legal entity name *', 'legal_entity_name')}
            {F('Entity type *', 'entity_type', 'text', ENTITY_TYPES as unknown as string[])}
            {F('Trade licence number *', 'trade_licence_number')}
            {F('Trade licence authority', 'trade_licence_authority')}
            {F('VAT registration number (TRN)', 'vat_trn')}
            {F('Company registration no.', 'company_reg_no')}
            {F('Industry / sector *', 'industry', 'text', INDUSTRIES as unknown as string[])}
            {F('Country of registration *', 'country')}
            {F('State / Emirate *', 'emirate', 'text', UAE_EMIRATES as unknown as string[])}
            {F('City *', 'city')}
            {F('Postal code', 'postal_code')}
            {F('Website', 'website', 'url')}
          </div>
          <div className="mt-4">
            <label className="label">{tr("Business description *")}</label>
            <textarea className="input min-h-[90px]" value={form.business_description} onChange={(e) => set('business_description', e.target.value)} />
            {errors.business_description && <p className="mt-1 text-xs text-rose-600">{errors.business_description}</p>}
          </div>
          <div className="mt-4">
            <label className="label">{tr("Registered address *")}</label>
            <textarea className="input min-h-[70px]" value={form.registered_address} onChange={(e) => set('registered_address', e.target.value)} />
            {errors.registered_address && <p className="mt-1 text-xs text-rose-600">{errors.registered_address}</p>}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{tr("Authorised signatory / contact details")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {F('Signatory full name *', 'signatory_name')}
            {F('Designation *', 'signatory_designation')}
            {F('Official email *', 'official_email', 'email')}
            {F('Mobile with country code *', 'mobile', 'text')}
            {F('Alternate contact number', 'alt_contact')}
          </div>
        </Card>

        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
      </form>
    </div>
  );
}
