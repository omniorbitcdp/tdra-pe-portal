'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card } from '@/components/ui';
import { Loader, ErrorBox } from '@/components/nav';

export default function AdminOverview() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<{ counts: Record<string, number> }>('/api/admin/overview').then((r) => { if (!r.ok) setError(r.data.error); else setCounts((r.data as unknown as { counts: Record<string, number> }).counts); }); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!counts) return <Loader />;
  const tiles = [
    ['Registered entities', counts.entities], ['Pending KYC review', counts.pendingKyc],
    ['Header requests', counts.headers], ['Template requests', counts.templates], ['URL requests', counts.urls],
    ['Portal users', counts.users], ['Configured API providers', counts.providers], ['Failed notifications', counts.failedNotifs],
  ] as const;
  return (
    <div>
      <PageHeader title={tr("Platform Overview")} subtitle={tr("Administrative summary (least-privilege, audited)")} />
      <div className="grid gap-4 md:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={label}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
