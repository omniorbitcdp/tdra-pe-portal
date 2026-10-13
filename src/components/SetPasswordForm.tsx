'use client';
import Link from 'next/link';
import { useState } from 'react';

export function SetPasswordForm({ token, action }: { token: string; action: 'activate' | 'reset' }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const res = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || data.ok === false) { setError(data.errors?.password ?? data.error ?? 'Could not set password.'); return; }
    setMessage(data.message); setDone(true);
  }

  if (done) return <div className="mt-6"><div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div><Link className="btn-primary mt-4 inline-flex w-full" href="/login">Go to sign in</Link></div>;

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <div><label className="label">New password</label><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <div><label className="label">Confirm password</label><input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : action === 'activate' ? 'Activate account' : 'Reset password'}</button>
    </form>
  );
}
