'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, Empty } from '@/components/ui';
import { Loader, ErrorBox } from '@/components/nav';

interface Row { id: number; module: string; action: string; actor_email: string | null; actor_role: string | null; from_status: string | null; to_status: string | null; remarks: string | null; created_at: string }

export default function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [module, setModule] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  async function load() { const r = await api<{ audit: Row[] }>(`/api/admin/audit${module ? `?module=${module}` : ''}`); if (r.ok) setRows((r.data as unknown as { audit: Row[] }).audit ?? []); else setError(r.data.error); setLoaded(true); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [module]);
  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title="Audit Trail" subtitle="Reviewer identity, action, timestamp, remarks and status transitions" />
      <ErrorBox message={error} />
      <div className="mb-4"><select className="input max-w-[220px]" value={module} onChange={(e) => setModule(e.target.value)}>
        <option value="">All modules</option>
        {['AUTH', 'ACCOUNT', 'KYC', 'DOCUMENT', 'HEADER', 'TEMPLATE', 'URL', 'ADMIN', 'API_CONFIG'].map((m) => <option key={m}>{m}</option>)}
      </select></div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <Empty>No audit entries.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">When</th><th className="th">Module</th><th className="th">Action</th><th className="th">Actor</th><th className="th">From → To</th><th className="th">Remarks</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="td">{r.module}</td><td className="td">{r.action}</td>
                <td className="td text-xs">{r.actor_email ?? '—'} <span className="text-slate-400">{r.actor_role ?? ''}</span></td>
                <td className="td text-xs">{r.from_status ?? '—'} → {r.to_status ?? '—'}</td>
                <td className="td">{r.remarks ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
