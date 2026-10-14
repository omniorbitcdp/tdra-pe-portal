import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, homeForRole } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const HIGHLIGHTS = [
  { title: 'Register your sender IDs', body: 'Raise headers, track every approval stage and keep the DLT reference in one place.' },
  { title: 'Build SMS templates', body: 'Declare variables as <var1>, <var2> … and attach the sample content a reviewer needs.' },
  { title: 'Clear the KYC pack', body: 'Trade licence, Emirates ID, signatory letter and VAT certificate — reviewed end to end.' },
];

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.role));

  let brand = { name: 'Onextel', short: 'OX', logo: null as string | null };
  try {
    const s = await getSettings();
    brand = { name: s.operatorName, short: s.operatorShortName, logo: s.logoDataUrl ?? null };
  } catch { /* fall back to defaults */ }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      {/* left: brand / story panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-50 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute right-10 top-1/3 h-40 w-40 rounded-full bg-amber-100/60 blur-2xl" />

        <div className="relative flex items-center gap-3">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt={brand.name} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-base font-bold text-blue-700 shadow-sm ring-1 ring-blue-100">
              {brand.short.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="text-lg font-bold tracking-tight text-slate-800">{brand.name}</span>
        </div>

        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-blue-100">
            Principal Entity Onboarding
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-900">
            Get your SMS sender IDs, templates and DLT URLs approved.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            A single workspace for Principal Entities, KYC reviewers and the platform administrator — every step gated in the right order.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">✓</span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{h.title}</span>
                  <span className="block text-xs leading-relaxed text-slate-500">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative grid grid-cols-3 gap-3">
          {[
            { k: 'SMS', v: 'Templates only' },
            { k: '4', v: 'Mandatory KYC docs' },
            { k: '6', v: 'Gated workflow steps' },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-white/70 bg-white/60 px-4 py-3 backdrop-blur">
              <div className="text-xl font-bold text-slate-800">{s.k}</div>
              <div className="text-[11px] leading-tight text-slate-500">{s.v}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* right: login module */}
      <main className="flex flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt={brand.name} className="h-10 w-auto max-w-[150px] object-contain" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100">
                {brand.short.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="text-base font-bold text-slate-800">{brand.name}</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">Welcome back — sign in to continue your registrations.</p>

          <LoginForm />

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Demo accounts</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-600">
              admin@tdra.demo / Admin@12345<br />
              pe.demo@acme.ae / PE@12345
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-400">Onextel Copyright 2026</p>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            <Link className="hover:text-slate-600" href="/register">Create a PE account</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
