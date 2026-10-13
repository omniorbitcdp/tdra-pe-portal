'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';

interface Tpl { id: string; template_code: string | null; template_name: string; category: string; channel: string; status: string; header_id: string; remarks: string | null }
interface Hdr { id: string; header_code: string | null; header_name: string; sender_id: string; status: string }

export default function TemplatesPage() {
  const [items, setItems] = useState<Tpl[]>([]);
  const [headers, setHeaders] = useState<Hdr[]>([]);
  const [allHeaders, setAllHeaders] = useState<Hdr[]>([]);
  const [form, setForm] = useState({ header_id: '', template_name: '', category: 'TRANSACTIONAL', channel: 'SMS', body: '', variables: '' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({}); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);

  async function load() {
    const [t, h] = await Promise.all([api<{ templates: Tpl[] }>('/api/pe/templates'), api<{ headers: Hdr[] }>('/api/pe/headers')]);
    if (t.ok) setItems((t.data as unknown as { templates: Tpl[] }).templates ?? []);
    if (h.ok) { const all = (h.data as unknown as { headers: Hdr[] }).headers ?? []; setAllHeaders(all); setHeaders(all.filter((x) => x.status === 'APPROVED')); }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrors({}); setError(''); setNotice('');
    const res = await api('/api/pe/templates', { method: 'POST', body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? 'Could not create'); return; }
    setForm({ header_id: '', template_name: '', category: 'TRANSACTIONAL', channel: 'SMS', body: '', variables: '' }); setNotice('Template draft created.'); await load();
  }
  async function submit(id: string) {
    setError(''); setNotice('');
    const res = await api('/api/pe/submit', { method: 'POST', body: JSON.stringify({ module: 'TEMPLATE', id }) });
    if (!res.ok) setError(res.data.error ?? 'Submit failed'); else { setNotice('Template submitted for approval.'); await load(); }
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="Template Registration" subtitle="Section 6 — requires an approved header" />
      <ErrorBox message={error} /><Notice message={notice} />
      <Card className="mb-6">
        {headers.length === 0
          ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">You need at least one <strong>approved header</strong> before registering a template.</div>
          : (
            <form onSubmit={create} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div><label className="label">Approved header *</label><select className="input" value={form.header_id} onChange={(e) => setForm({ ...form, header_id: e.target.value })}><option value="">Select…</option>{headers.map((h) => <option key={h.id} value={h.id}>{h.header_name} ({h.sender_id})</option>)}</select>{errors.header_id && <p className="mt-1 text-xs text-rose-600">{errors.header_id}</p>}</div>
                <div><label className="label">Template name</label><input className="input" value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} />{errors.template_name && <p className="mt-1 text-xs text-rose-600">{errors.template_name}</p>}</div>
                <div><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="TRANSACTIONAL">Transactional</option><option value="OTP">OTP</option><option value="PROMOTIONAL">Promotional</option><option value="SERVICE">Service</option></select></div>
                <div><label className="label">Channel</label><select className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="SMS">SMS</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select></div>
              </div>
              <div><label className="label">Template body</label><textarea className="input min-h-[80px]" placeholder="Dear {{name}}, your order {{order_id}} …" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />{errors.body && <p className="mt-1 text-xs text-rose-600">{errors.body}</p>}</div>
              <div><label className="label">Variables (comma separated)</label><input className="input" placeholder="name,order_id,link" value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} /></div>
              <button className="btn-primary" disabled={busy}>Add template</button>
            </form>
          )}
      </Card>
      <Card className="overflow-x-auto">
        {items.length === 0 ? <Empty>No templates yet.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">Template ID</th><th className="th">Name</th><th className="th">Header</th><th className="th">Category</th><th className="th">Channel</th><th className="th">Status</th><th className="th">Remarks</th><th className="th"></th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="td font-mono text-xs">{t.template_code ?? "—"}</td><td className="td font-medium">{t.template_name}</td><td className="td text-xs">{allHeaders.find((x) => x.id === t.header_id)?.header_code ?? "—"}</td><td className="td">{t.category}</td><td className="td">{t.channel}</td>
                  <td className="td"><StatusPill status={t.status} /></td><td className="td">{t.remarks ?? '—'}</td>
                  <td className="td">{(t.status === 'DRAFT' || t.status === 'CLARIFICATION_REQUIRED' || t.status === 'REJECTED') && <button className="btn-ghost" onClick={() => submit(t.id)}>{t.status === 'DRAFT' ? 'Submit' : 'Resubmit'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
