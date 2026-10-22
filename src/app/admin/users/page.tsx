'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { ROLES, ROLE_LABELS, ACCOUNT_STATUSES } from '@/lib/constants';

interface User { id: string; email: string; full_name: string | null; role: string; status: string; entity_id: string | null; last_login_at: string | null }

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'OPERATOR_KYC', password: '' });
  const [busy, setBusy] = useState(false);

  async function load() { const r = await api<{ users: User[] }>('/api/admin/users'); if (r.ok) setUsers((r.data as unknown as { users: User[] }).users ?? []); else setError(r.data.error); setLoaded(true); }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrors({}); setError(''); setNotice('');
    const res = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? tr('Could not create user')); return; }
    setForm({ full_name: '', email: '', phone: '', role: 'OPERATOR_KYC', password: '' }); setNotice(tr('User created.')); await load();
  }
  async function patch(id: string, body: Record<string, string>) {
    const res = await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!res.ok) setError(res.data.error ?? tr('Update failed')); else { setNotice(tr('User updated.')); await load(); }
  }
  async function resetPassword(id: string) {
    const pw = window.prompt('New password (min 10 chars, upper/lower/digit/symbol):');
    if (!pw) return;
    await patch(id, { password: pw });
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title={tr("Users & Role Assignments")} subtitle={tr("Operator, admin and enterprise accounts. Least-privilege, audited.")} />
      <ErrorBox message={error} /><Notice message={notice} />
      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{tr("Create user")}</h2>
        <form onSubmit={create} className="grid gap-4 md:grid-cols-5 md:items-end">
          <div><label className="label">{tr("Full name")}</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">{tr("Email")}</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />{errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email}</p>}</div>
          <div><label className="label">{tr("Role")}</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
          <div><label className="label">{tr("Temp password")}</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />{errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password}</p>}</div>
          <button className="btn-primary" disabled={busy}>{tr("Create")}</button>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        {users.length === 0 ? <Empty>{tr("No users.")}</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">{tr("Email")}</th><th className="th">{tr("Name")}</th><th className="th">{tr("Role")}</th><th className="th">{tr("Status")}</th><th className="th">{tr("Last login")}</th><th className="th">{tr("Actions")}</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="td">{u.email}</td><td className="td">{u.full_name ?? '—'}</td>
                  <td className="td"><select className="input max-w-[230px]" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></td>
                  <td className="td"><StatusPill status={u.status} /></td>
                  <td className="td text-xs">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      <select className="input max-w-[140px]" value={u.status} onChange={(e) => patch(u.id, { status: e.target.value })}>{ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                      <button className="btn-ghost" onClick={() => resetPassword(u.id)}>{tr("Reset password")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
