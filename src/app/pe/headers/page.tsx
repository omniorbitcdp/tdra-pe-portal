'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';

interface Header { id: string; header_name: string; sender_id: string; header_type: string; status: string; remarks: string | null }

export default function HeadersPage() {
  const [items, setItems] = useState<Header[]>([]);
  const [form, setForm] = useState({ header_name: '', sender_id: '', header_type: 'ALPHANUMERIC' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({}); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() { const r = await api<{ headers: Header[] }>('/api/pe/headers'); if (r.ok) setItems((r.data as unknown as { headers: Header[] }).headers ?? []); setLoaded(true); }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrors({}); setError(''); setNotice('');
    const res = await api('/api/pe/headers', { method: 'POST', body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? 'Could not create'); return; }
    setForm({ header_name: '', sender_id: '', header_type: 'ALPHANUMERIC' }); setNotice('Header draft created.'); await load();
  }
  async function submit(id: string) {
    setError(''); setNotice('');
    const res = await api('/api/pe/submit', { method: 'POST', body: JSON.stringify({ module: 'HEADER', id }) });
    if (!res.ok) setError(res.data.error ?? 'Submit failed'); else { setNotice('Header submitted for approval.'); await load(); }
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="Header Registration" subtitle="Section 6 — requires approved KYC before submission" />
      <ErrorBox message={error} /><Notice message={notice} />
      <Card className="mb-6">
        <form onSubmit={create} className="grid gap-4 md:grid-cols-4 md:items-end">
          <div><label className="label">Header name</label><input className="input" value={form.header_name} onChange={(e) => setForm({ ...form, header_name: e.target.value })} />{errors.header_name && <p className="mt-1 text-xs text-rose-600">{errors.header_name}</p>}</div>
          <div><label className="label">Sender ID</label><input className="input" placeholder="ACME" value={form.sender_id} onChange={(e) => setForm({ ...form, sender_id: e.target.value })} />{errors.sender_id && <p className="mt-1 text-xs text-rose-600">{errors.sender_id}</p>}</div>
          <div><label className="label">Type</label><select className="input" value={form.header_type} onChange={(e) => setForm({ ...form, header_type: e.target.value })}><option value="ALPHANUMERIC">Alphanumeric</option><option value="NUMERIC">Numeric</option><option value="SHORTCODE">Shortcode</option></select></div>
          <button className="btn-primary" disabled={busy}>Add header</button>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        {items.length === 0 ? <Empty>No headers yet.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">Header</th><th className="th">Sender ID</th><th className="th">Type</th><th className="th">Status</th><th className="th">Remarks</th><th className="th"></th></tr></thead>
            <tbody>
              {items.map((h) => (
                <tr key={h.id}>
                  <td className="td font-medium">{h.header_name}</td><td className="td">{h.sender_id}</td><td className="td">{h.header_type}</td>
                  <td className="td"><StatusPill status={h.status} /></td><td className="td">{h.remarks ?? '—'}</td>
                  <td className="td">{(h.status === 'DRAFT' || h.status === 'CLARIFICATION_REQUIRED' || h.status === 'REJECTED') && <button className="btn-ghost" onClick={() => submit(h.id)}>Submit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
