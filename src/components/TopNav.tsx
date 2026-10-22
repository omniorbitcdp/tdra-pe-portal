'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from '@/lib/nav';
import { Icon, type IconName } from './icons';
import { useLang } from './LangProvider';

export function TopNav({ groups, pending = {} }: { groups: NavGroup[]; pending?: Record<string, number> }) {
  const pathname = usePathname();
  const { t } = useLang();
  const items = groups.flatMap((g) => g.items);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  const badgeFor = (href: string) => {
    const key = Object.keys(pending).find((k) => href.endsWith(k.toLowerCase()));
    return key ? pending[key] : 0;
  };

  return (
    <nav className="border-t border-slate-100 bg-white">
      <div className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4">
        {items.map((it) => {
          const active = isActive(it.href, it.exact);
          const count = it.badge === 'pending' ? badgeFor(it.href) : 0;
          return (
            <Link key={it.href} href={it.href}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-semibold transition ${
                active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700'}`}>
              <Icon name={it.icon as IconName} className="h-4 w-4" />
              {t(it.label)}
              {count > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{count}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
