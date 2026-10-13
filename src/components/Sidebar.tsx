'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { IconName, NavGroup } from '@/lib/nav';

const ICONS: Record<IconName, string[]> = {
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  profile: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  kyc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M9 15l2 2 4-4'],
  header: ['M4 7h16', 'M4 12h10', 'M4 17h7', 'M16 14l3 3 5-6'],
  template: ['M12 2 2 7l10 5 10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  url: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  settings: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  api: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13A4 4 0 0 1 16 11'],
  audit: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M9 2h6v4H9z', 'M8 12h8', 'M8 16h5'],
  bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  queue: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
};

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export interface SidebarProps {
  groups: NavGroup[];
  user: { name: string; email: string; roleLabel: string; initials: string };
  operator: { name: string; logoDataUrl: string | null; shortName: string };
  /** module -> number of items awaiting action (renders a badge) */
  pending?: Record<string, number>;
}

export function Sidebar({ groups, user, operator, pending = {} }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const pendingFor = (href: string) => {
    const key = Object.keys(pending).find((k) => href.endsWith(k.toLowerCase()));
    return key ? pending[key] : 0;
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-4">
        {operator.logoDataUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={operator.logoDataUrl} alt={operator.name} className="h-9 w-auto max-w-[120px] object-contain" />
          : <div className="brand-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white">
              {operator.shortName.slice(0, 2).toUpperCase()}
            </div>}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">{operator.name}</div>
          <div className="truncate text-[11px] text-slate-400">TDRA PE Portal</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">{g.title}</div>}
            <ul className="space-y-1">
              {g.items.map((it) => {
                const active = isActive(it.href, it.exact);
                const count = it.badge === 'pending' ? pendingFor(it.href) : 0;
                return (
                  <li key={it.href}>
                    <Link href={it.href} onClick={() => setOpen(false)}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        active ? 'bg-white/10 font-semibold text-white shadow-inner' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                      <span className={active ? 'text-sky-300' : 'text-slate-400 group-hover:text-slate-200'}>
                        <Icon name={it.icon} />
                      </span>
                      <span className="flex-1 truncate">{it.label}</span>
                      {count > 0 && (
                        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950">{count}</span>
                      )}
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/90 text-xs font-bold text-white">
            {user.initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-white">{user.name}</div>
            <div className="truncate text-[10px] text-slate-400">{user.roleLabel}</div>
          </div>
        </div>
        <button onClick={signOut}
          className="w-full rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span className="brand-bg flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold text-white">
            {operator.shortName.slice(0, 2).toUpperCase()}
          </span>
          {operator.name}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-white/20 px-3 py-1 text-xs font-semibold text-white">
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed z-50 h-full w-64 shrink-0 bg-slate-900 transition-transform lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'}`}>
        {nav}
      </aside>
    </>
  );
}
