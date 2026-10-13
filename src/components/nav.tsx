'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Tabs({ items }: { items: Array<{ href: string; label: string }> }) {
  const path = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
      {items.map((it) => {
        const active = path === it.href || (it.href !== '/pe' && it.href !== '/operator' && it.href !== '/admin' && path.startsWith(it.href));
        return (
          <Link key={it.href} href={it.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${active ? 'brand-border brand-text' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Loader({ label = 'Loading…' }: { label?: string }) {
  return <div className="py-16 text-center text-sm text-slate-400">{label}</div>;
}

export function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</div>;
}

export function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>;
}
