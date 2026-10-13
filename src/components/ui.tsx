// Tiny shared presentational kit used across all screens.
import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-sky-100 text-sky-700',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-700',
  CLARIFICATION_REQUIRED: 'bg-amber-100 text-amber-800',
  RESUBMITTED: 'bg-sky-100 text-sky-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  PENDING_VERIFICATION: 'bg-slate-100 text-slate-600',
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  RESUBMISSION_REQUIRED: 'bg-amber-100 text-amber-800',
  PENDING_ACTIVATION: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  LOCKED: 'bg-amber-100 text-amber-800',
  DISABLED: 'bg-rose-100 text-rose-700',
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700',
  SKIPPED: 'bg-slate-100 text-slate-500',
  NOT_STARTED: 'bg-slate-100 text-slate-500',
};

export function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600';
  return <span className={`pill ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function KeyVal({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">{value ?? '—'}</div>
    </div>
  );
}
