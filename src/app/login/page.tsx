import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, homeForRole } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AuthBrandPanel, AuthMobileBrand, COPYRIGHT, type Brand } from '@/components/AuthPanel';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.role));

  let brand: Brand = { name: 'Onextel', short: 'OX', logo: null };
  try {
    const s = await getSettings();
    brand = { name: s.operatorName, short: s.operatorShortName, logo: s.logoDataUrl ?? null };
  } catch { /* fall back to defaults */ }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.15fr_1fr]">
      <AuthBrandPanel brand={brand} />

      <main className="flex flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <AuthMobileBrand brand={brand} />

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold text-blue-700">Hello!</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Welcome to {brand.name}</h2>
            <p className="mt-1.5 text-sm text-slate-500">A secure platform to manage your commercial communication.</p>

            <LoginForm />

            <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs">
              <Link className="font-semibold text-blue-700 hover:underline" href="/register">New Business Registration</Link>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-400">{COPYRIGHT}</p>
        </div>
      </main>
    </div>
  );
}
