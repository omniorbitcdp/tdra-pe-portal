'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api, hasApiCache } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { isEditable, lockNote } from '@/lib/constants';

interface Header { id: string; header_code: string | null; header_name: string; sender_id: string; header_type: string; ussd: string | null; status: string; remarks: string | null }

const EMPTY = { header_name: '', sender_id: '', header_type: 'ALPHANUMERIC' };

export default function HeadersPage() {
  const [items, setItems] = useState<Header[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [loaded, setLoaded] = useState(() => hasApiCache('/api/pe/headers'));
  const [error, setError] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({}); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false); const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState('');

  async function load() { const r = await api<{ headers: Header[] }>('/api/pe/headers'); if (r.ok) setItems((r.data as unknown as { headers: Header[] }).headers ?? []); setLoaded(true); }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setErrors({}); setError(''); setNotice('');
    const res = await api('/api/pe/headers', { method: 'POST', body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? tr('Could not create')); return; }
    setForm({ ...EMPTY }); setNotice(tr('Header draft created.')); await load();
  }

  async function submit(id: string) {
    if (busyId) return;               // one submission in flight at a time
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/pe/submit', { method: 'POST', body: JSON.stringify({ module: 'HEADER', id }) });
    setBusyId('');
    if (!res.ok) setError(res.data.error ?? tr('Submit failed')); else { setNotice(tr('Header submitted for approval.')); await load(); }
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title={tr("Header Registration")} subtitle={tr("Section 6 — requires approved KYC before submission")} />
      <ErrorBox message={error} /><Notice message={notice} />
      <Card className="mb-6">
        <form onSubmit={create} className="grid gap-4 md:grid-cols-4 md:items-end">
          <div><label className="label">{tr("Header name")}</label><input className="input" value={form.header_name} onChange={(e) => setForm({ ...form, header_name: e.target.value })} />{errors.header_name && <p className="mt-1 text-xs text-rose-600">{errors.header_name}</p>}</div>
          <div><label className="label">{tr("Sender ID")}</label><input className="input" placeholder="ACME" value={form.sender_id} onChange={(e) => setForm({ ...form, sender_id: e.target.value })} />{errors.sender_id && <p className="mt-1 text-xs text-rose-600">{errors.sender_id}</p>}</div>
          <div><label className="label">{tr("Type")}</label><select className="input" value={form.header_type} onChange={(e) => setForm({ ...form, header_type: e.target.value })}><option value="ALPHANUMERIC">{tr("Alphanumeric")}</option><option value="NUMERIC">{tr("Numeric")}</option><option value="SHORTCODE">{tr("Shortcode")}</option></select></div>
          <button className="btn-primary" disabled={busy}>{busy ? tr('Adding…') : tr('Add header')}</button>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        {items.length === 0 ? <Empty>{tr("No headers yet.")}</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">{tr("Header ID")}</th><th className="th">{tr("Header")}</th><th className="th">{tr("Sender ID")}</th><th className="th">{tr("Type")}</th><th className="th">{tr("Status")}</th><th className="th">{tr("Remarks")}</th><th className="th"></th></tr></thead>
            <tbody>
              {items.map((h) => (
                <>
                  <tr key={h.id}>
                    <td className="td font-mono text-xs">{h.header_code ?? '—'}</td><td className="td font-medium">{h.header_name}</td><td className="td">{h.sender_id}</td><td className="td">{tr(h.header_type)}</td>
                    <td className="td"><StatusPill status={h.status} /></td><td className="td">{h.remarks ?? '—'}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        {isEditable(h.status) && <button className="btn-ghost btn-sm" onClick={() => setEditing(editing === h.id ? '' : h.id)}>{editing === h.id ? 'Close' : 'Edit'}</button>}
                        {(h.status === 'DRAFT' || h.status === 'CLARIFICATION_REQUIRED' || h.status === 'REJECTED') && (
                          <button className="btn-ghost btn-sm" disabled={busyId === h.id} onClick={() => submit(h.id)}>
                            {busyId === h.id ? tr('Sending…') : h.status === 'DRAFT' ? tr('Submit') : tr('Resubmit')}
                          </button>
                        )}
                        {!isEditable(h.status) && <span className="text-xs text-slate-400">{tr(lockNote(h.status))}</span>}
                      </div>
                    </td>
                  </tr>
                  {editing === h.id && (
                    <tr key={`${h.id}-edit`}>
                      <td className="td bg-slate-50" colSpan={7}><HeaderEditor header={h} onSaved={async () => { setEditing(''); setNotice(tr('Header updated.')); await load(); }} /></td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function HeaderEditor({ header, onSaved }: { header: Header; onSaved: () => void | Promise<void> }) {
  const [d, setD] = useState({ header_name: header.header_name, sender_id: header.sender_id, header_type: header.header_type, ussd: header.ussd ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return; setBusy(true); setErr(''); setErrors({});
    const res = await api('/api/pe/headers', { method: 'PUT', body: JSON.stringify({ id: header.id, ...d }) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setErr(res.data.error ?? tr('Could not save')); return; }
    await onSaved();
  }

  return (
    <div className="space-y-3 py-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("Edit header ·")} <span className="font-mono">{header.header_code ?? header.header_name}</span></div>
      {header.status === 'CLARIFICATION_REQUIRED' && header.remarks && (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">Reviewer remarks: {header.remarks}</p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div><label className="label">{tr("Header name")}</label><input className="input" value={d.header_name} onChange={(e) => setD({ ...d, header_name: e.target.value })} />{errors.header_name && <p className="mt-1 text-xs text-rose-600">{errors.header_name}</p>}</div>
        <div><label className="label">{tr("Sender ID")}</label><input className="input" value={d.sender_id} onChange={(e) => setD({ ...d, sender_id: e.target.value })} />{errors.sender_id && <p className="mt-1 text-xs text-rose-600">{errors.sender_id}</p>}</div>
        <div><label className="label">{tr("Type")}</label><select className="input" value={d.header_type} onChange={(e) => setD({ ...d, header_type: e.target.value })}><option value="ALPHANUMERIC">{tr("Alphanumeric")}</option><option value="NUMERIC">{tr("Numeric")}</option><option value="SHORTCODE">{tr("Shortcode")}</option></select></div>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <button className="btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? tr('Saving…') : tr('Save changes')}</button>
    </div>
  );
}
