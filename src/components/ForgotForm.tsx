'use client';
import { t as tr } from '@/lib/i18n/live';
import { useState } from 'react';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const res = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(data.message ?? 'If the account exists, a reset link has been sent.');
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {message && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
      <div><label className="label">{tr("Email")}</label><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
    </form>
  );
}
