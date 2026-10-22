'use client';
import { t as tr } from '@/lib/i18n/live';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';

/** Which door the user is coming through. The server validates that the account
 *  really belongs to that side, so a business account cannot sign in at the
 *  telco door and vice versa. */
type Portal = 'ENTERPRISE' | 'TELCO';

const PORTALS: Array<{ key: Portal; label: string; hint: string }> = [
  { key: 'ENTERPRISE', label: 'Enterprise', hint: 'Business registration, headers, templates and URLs' },
  { key: 'TELCO', label: 'Telco', hint: 'KYC, header and template approvers, and administrators' },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [portal, setPortal] = useState<Portal>('ENTERPRISE');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const active = PORTALS.find((p) => p.key === portal)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await api<{ redirect: string }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password, portal }),
    });
    setBusy(false);
    if (!res.ok) { setError(res.data.error ?? tr('Sign in failed')); return; }
    router.push(params.get('next') || res.data.redirect || '/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {/* Enterprise / Telco selector */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {PORTALS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => { setPortal(p.key); setError(''); }}
            aria-pressed={portal === p.key}
            className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
              portal === p.key ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tr(p.label)}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{tr(active.hint)}</p>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div>
        <label className="label" htmlFor="email">{tr("E-mail address")}</label>
        <input id="email" type="email" className="input" placeholder={tr("Enter your e-mail address")}
          value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </div>

      <div>
        <label className="label" htmlFor="password">{tr("Password")}</label>
        <div className="relative">
          <input id="password" type={showPw ? 'text' : 'password'} className="input pr-16" placeholder={tr("Enter your password")}
            value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <button type="button" onClick={() => setShowPw(!showPw)}
            className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
            {showPw ? tr('Hide') : tr('Show')}
          </button>
        </div>
      </div>

      <div className="text-right">
        <Link className="text-xs text-slate-500 hover:text-slate-700" href="/forgot">{tr("Forgot password?")}</Link>
      </div>

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? tr('Signing in…') : tr('Sign in as {portal}', { portal: tr(active.label) })}
      </button>
    </form>
  );
}
