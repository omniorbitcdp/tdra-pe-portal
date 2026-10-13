'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await api<{ redirect: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (!res.ok) { setError(res.data.error ?? 'Sign in failed'); return; }
    router.push(params.get('next') || res.data.redirect || '/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <div className="flex justify-between text-xs">
        <Link className="brand-text font-semibold" href="/register">Create a PE account</Link>
        <Link className="text-slate-500" href="/forgot">Forgot password?</Link>
      </div>
    </form>
  );
}
