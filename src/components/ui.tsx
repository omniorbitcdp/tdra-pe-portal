// Shared presentational kit. Designed for dense operational screens: clear
// hierarchy, scannable status, consistent spacing.
import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-end justify-between gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{children}</h2>
      {right}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: {
  title: string; subtitle?: string; actions?: React.ReactNode; breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2 text-xs text-slate-400">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  SUBMITTED: 'bg-sky-50 text-sky-700 ring-sky-200',
  UNDER_REVIEW: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  CLARIFICATION_REQUIRED: 'bg-amber-50 text-amber-800 ring-amber-200',
  RESUBMITTED: 'bg-sky-50 text-sky-700 ring-sky-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
  PENDING_VERIFICATION: 'bg-slate-100 text-slate-600 ring-slate-200',
  VERIFIED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RESUBMISSION_REQUIRED: 'bg-amber-50 text-amber-800 ring-amber-200',
  PENDING_ACTIVATION: 'bg-amber-50 text-amber-800 ring-amber-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  LOCKED: 'bg-amber-50 text-amber-800 ring-amber-200',
  DISABLED: 'bg-rose-50 text-rose-700 ring-rose-200',
  SENT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 ring-rose-200',
  SKIPPED: 'bg-slate-100 text-slate-500 ring-slate-200',
  NOT_STARTED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  return <span className={`pill ring-1 ring-inset ${cls} ${className}`}>{status.replace(/_/g, ' ')}</span>;
}

export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center">
      <div className="text-sm text-slate-500">{children}</div>
      {action}
    </div>
  );
}

export function KeyVal({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="truncate text-sm text-slate-800">{value ?? '—'}</div>
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'amber' | 'emerald' | 'rose' | 'sky' | 'indigo';
  href?: string;
  active?: boolean;
}

const TONES: Record<string, string> = {
  default: 'text-slate-900',
  amber: 'text-amber-600',
  emerald: 'text-emerald-600',
  rose: 'text-rose-600',
  sky: 'text-sky-600',
  indigo: 'text-indigo-600',
};

export function StatCard({ label, value, hint, tone = 'default', href, active }: StatCardProps) {
  const inner = (
    <>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1.5 text-3xl font-bold tabular-nums leading-none ${TONES[tone]}`}>{value}</div>
      {hint && <div className="mt-1.5 text-[11px] text-slate-400">{hint}</div>}
    </>
  );
  const cls = `card block p-4 transition ${active ? 'ring-2 ring-slate-900' : href ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`;
  return href ? <a href={href} className={cls}>{inner}</a> : <div className={cls}>{inner}</div>;
}

export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const map: Record<number, string> = {
    2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5', 6: 'sm:grid-cols-3 lg:grid-cols-6',
  };
  return <div className={`grid grid-cols-1 gap-4 ${map[cols]}`}>{children}</div>;
}

/** Horizontal progress for the registration chain. */
export function Stepper({ steps }: { steps: Array<{ label: string; status: string; ok: boolean; href?: string; note?: string }> }) {
  const done = steps.filter((s) => s.ok).length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-slate-500">{done}/{steps.length} complete</span>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const Wrapper = s.href ? 'a' : 'div';
          return (
            <li key={s.label}>
              <Wrapper {...(s.href ? { href: s.href } : {})}
                className={`flex h-full items-start gap-3 rounded-xl border p-3 transition ${s.ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  s.ok ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{s.ok ? '✓' : i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{s.label}</span>
                  <span className="mt-1 block"><StatusPill status={s.status} /></span>
                  {s.note && <span className="mt-1 block text-[11px] text-slate-500">{s.note}</span>}
                </span>
              </Wrapper>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="label">{label}</div>{children}</div>;
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  const cls = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return <span className={`inline-flex ${cls} shrink-0 items-center justify-center rounded-full bg-slate-700 font-bold text-white`}>{initials}</span>;
}
