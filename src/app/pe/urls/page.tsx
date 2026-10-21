'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { isEditable } from '@/lib/constants';

interface Url { id: string; url_code: string | null; url: string; method: string; callback_type: string; status: string; template_id: string; remarks: string | null }
interface Tpl { id: string; template_code: string | null; template_name: string; status: string }

const EMPTY = { template_id: '', url: '', method: 'POST', callback_type: 'DLT' };

export default function UrlsPage() {
  const [items, setItems] = useState<Url[]>([]);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [allTemplates, setAllTemplates] = useState<Tpl[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({}); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false); const [busyId, setBusyId] = useState(''); const [editing, setEditing] = useState('');

  async function load() {
    const [u, t] = await Promise.all([api<{ urls: Url[] }>('/api/pe/urls'), api<{ templates: Tpl[] }>('/api/pe/templates')]);
    if (u.ok) setItems((u.data as unknown as { urls: Url[] }).urls ?? []);
    if (t.ok) { const all = (t.data as unknown as { templates: Tpl[] }).templates ?? []; setAllTemplates(all); setTemplates(all.filter((x) => x.status === 'APPROVED')); }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setErrors({}); setError(''); setNotice('');
    const res = await api('/api/pe/urls', { method: 'POST', body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? 'Could not create'); return; }
    setForm({ ...EMPTY }); setNotice('URL draft created.'); await load();
  }

  async function submit(id: string) {
    if (busyId) return;
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/pe/submit', { method: 'POST', body: JSON.stringify({ module: 'URL', id }) });
    setBusyId('');
    if (!res.ok) setError(res.data.error ?? 'Submit failed'); else { setNotice('URL submitted for approval.'); await load(); }
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="URL Registration" subtitle="Section 6 — requires an approved template" />
      <ErrorBox message={error} /><Notice message={notice} />
      <Card className="mb-6">
        {templates.length === 0
          ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">You need at least one <strong>approved template</strong> before registering a URL.</div>
          : (
            <form onSubmit={create} className="grid gap-4 md:grid-cols-4 md:items-end">
              <div><label className="label">Approved template *</label><select className="input" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}><option value="">Select…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}</select>{errors.template_id && <p className="mt-1 text-xs text-rose-600">{errors.template_id}</p>}</div>
              <div className="md:col-span-2"><label className="label">URL</label><input className="input" placeholder="https://entity.ae/dlt/callback" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />{errors.url && <p className="mt-1 text-xs text-rose-600">{errors.url}</p>}</div>
              <div><label className="label">Method</label><select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="POST">POST</option><option value="GET">GET</option></select></div>
              <button className="btn-primary md:col-span-4" disabled={busy}>{busy ? 'Adding…' : 'Add URL'}</button>
            </form>
          )}
      </Card>
      <Card className="overflow-x-auto">
        {items.length === 0 ? <Empty>No URLs yet.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">URL ID</th><th className="th">URL</th><th className="th">Template</th><th className="th">Method</th><th className="th">Type</th><th className="th">Status</th><th className="th">Remarks</th><th className="th"></th></tr></thead>
            <tbody>
              {items.map((u) => (
                <>
                  <tr key={u.id}>
                    <td className="td font-mono text-xs">{u.url_code ?? '—'}</td><td className="td break-all font-medium">{u.url}</td><td className="td text-xs">{allTemplates.find((x) => x.id === u.template_id)?.template_code ?? '—'}</td><td className="td">{u.method}</td><td className="td">{u.callback_type}</td>
                    <td className="td"><StatusPill status={u.status} /></td><td className="td">{u.remarks ?? '—'}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        {isEditable(u.status) && <button className="btn-ghost btn-sm" onClick={() => setEditing(editing === u.id ? '' : u.id)}>{editing === u.id ? 'Close' : 'Edit'}</button>}
                        {(u.status === 'DRAFT' || u.status === 'CLARIFICATION_REQUIRED' || u.status === 'REJECTED') && (
                          <button className="btn-ghost btn-sm" disabled={busyId === u.id} onClick={() => submit(u.id)}>
                            {busyId === u.id ? 'Sending…' : u.status === 'DRAFT' ? 'Submit' : 'Resubmit'}
                          </button>
                        )}
                        {!isEditable(u.status) && <span className="text-xs text-slate-400">Under review</span>}
                      </div>
                    </td>
                  </tr>
                  {editing === u.id && (
                    <tr key={`${u.id}-edit`}>
                      <td className="td bg-slate-50" colSpan={8}><UrlEditor url={u} templates={templates} onSaved={async () => { setEditing(''); setNotice('URL updated.'); await load(); }} /></td>
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

function UrlEditor({ url, templates, onSaved }: { url: Url; templates: Tpl[]; onSaved: () => void | Promise<void> }) {
  const [d, setD] = useState({ template_id: url.template_id, url: url.url, method: url.method, callback_type: url.callback_type });
  const [errors, setErrors] = useState<Record<string, string>>({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return; setBusy(true); setErr(''); setErrors({});
    const res = await api('/api/pe/urls', { method: 'PUT', body: JSON.stringify({ id: url.id, ...d }) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setErr(res.data.error ?? 'Could not save'); return; }
    await onSaved();
  }

  return (
    <div className="space-y-3 py-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Edit URL · <span className="font-mono">{url.url_code ?? ''}</span></div>
      {url.status === 'CLARIFICATION_REQUIRED' && url.remarks && (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">Reviewer remarks: {url.remarks}</p>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2"><label className="label">URL</label><input className="input" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} />{errors.url && <p className="mt-1 text-xs text-rose-600">{errors.url}</p>}</div>
        <div><label className="label">Method</label><select className="input" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })}><option value="POST">POST</option><option value="GET">GET</option></select></div>
        <div><label className="label">Template</label><select className="input" value={d.template_id} onChange={(e) => setD({ ...d, template_id: e.target.value })}>{templates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}</select>{errors.template_id && <p className="mt-1 text-xs text-rose-600">{errors.template_id}</p>}</div>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <button className="btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
    </div>
  );
}
