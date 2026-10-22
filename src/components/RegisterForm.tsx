'use client';
import { t as tr } from '@/lib/i18n/live';
import { useState } from 'react';
import Link from 'next/link';

const POLICY = 'Min 10 chars, with uppercase, lowercase, digit and symbol.';

export function RegisterForm() {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || data.ok === false) { setErrors(data.errors ?? {}); setMessage(data.error ?? tr('Registration failed')); return; }
    setMessage(data.message);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {message && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
      <div><label className="label">{tr("Full name")}</label><input className="input" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required /><Err m={errors.full_name} /></div>
      <div><label className="label">{tr("Official email")}</label><input type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} required /><Err m={errors.email} /></div>
      <div><label className="label">{tr("Mobile (with country code)")}</label><input className="input" placeholder="+9715xxxxxxxx" value={form.phone} onChange={(e) => set('phone', e.target.value)} required /><Err m={errors.phone} /></div>
      <div><label className="label">{tr("Password")}</label><input type="password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} required /><p className="mt-1 text-xs text-slate-400">{tr(POLICY)}</p><Err m={errors.password} /></div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? tr('Creating…') : tr('Create account')}</button>
      {message && <Link className="btn-ghost w-full" href="/login">{tr("Continue to sign in")}</Link>}
    </form>
  );
}

function Err({ m }: { m?: string }) { return m ? <p className="mt-1 text-xs text-rose-600">{tr(m)}</p> : null; }
