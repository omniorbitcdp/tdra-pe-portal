import Link from 'next/link';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function GrievanceLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/grievance" className="flex items-center gap-3">
            {s.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logoDataUrl} alt={s.operatorName} className="h-9 w-auto max-w-[150px] object-contain" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                {s.operatorShortName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="text-sm font-bold text-slate-800">{s.operatorName}</span>
          </Link>
          <nav className="flex items-center gap-1 text-xs font-semibold">
            <Link href="/grievance" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Raise a grievance</Link>
            <Link href="/grievance/track" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Track</Link>
            <Link href="/login" className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">Enterprise / Telco login</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      <footer className="pb-8 text-center text-[11px] text-slate-400">© Onextel Copyright 2026</footer>
    </div>
  );
}
