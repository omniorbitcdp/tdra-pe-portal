'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';

interface Row { id: string; entity_name: string; status: string; remarks: string | null; [k: string]: unknown }

/** Queue workbench for Header / Template / URL reviewers.
 *  Rendered inside the /operator layout (which supplies the Shell). */
export function DecisionQueue({ module, title }: { module: 'HEADER' | 'TEMPLATE' | 'URL'; title: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  async function load() {
    const r = await api<{ queue: Row[] }>(`/api/operator/queue?module=${module}`);
    if (!r.ok) setError(r.data.error);
    else setRows((r.data as unknown as { queue: Row[] }).queue ?? []);
    setLoaded(true);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [module]);

  async function decide(id: string, action: string) {
    setError(''); setNotice('');
    const res = await api('/api/operator/decision', { method: 'POST', body: JSON.stringify({ module, id, action, remarks: remarks[id] ?? '' }) });
    if (!res.ok) { setError(res.data.error ?? 'Failed'); return; }
    setNotice(`${module} ${action.toLowerCase().replace('_', ' ')} recorded.`); await load();
  }

  if (!loaded) return <Loader />;
  const actionable = (s: string) => ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(s);

  return (
    <div>
      <PageHeader title={title} subtitle="Approve, reject or return a request for correction. Remarks are required for rejection / correction." />
      <ErrorBox message={error} /><Notice message={notice} />
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <Empty>Queue is empty.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">ID</th><th className="th">Entity</th><th className="th">Detail</th><th className="th">Status</th><th className="th">Remarks</th><th className="th">Action</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td font-mono text-xs">{String(r.header_code ?? r.template_code ?? r.url_code ?? "—")}</td>
                  <td className="td font-medium">{r.entity_name}</td>
                  <td className="td">
                    {module === 'HEADER' && <span>{String(r.header_name)} · {String(r.sender_id)}</span>}
                    {module === 'TEMPLATE' && <span>{String(r.template_name)} · {String(r.category)}</span>}
                    {module === 'URL' && <span className="break-all">{String(r.url)}</span>}
                  </td>
                  <td className="td"><StatusPill status={r.status} /></td>
                  <td className="td">{r.remarks ?? '—'}</td>
                  <td className="td">
                    {actionable(r.status) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="input max-w-[180px]" placeholder="Remarks" value={remarks[r.id] ?? ''} onChange={(e) => setRemarks({ ...remarks, [r.id]: e.target.value })} />
                        <button className="btn-success" onClick={() => decide(r.id, 'APPROVE')}>Approve</button>
                        <button className="btn-ghost" onClick={() => decide(r.id, 'REQUEST_CORRECTION')}>Correction</button>
                        <button className="btn-danger" onClick={() => decide(r.id, 'REJECT')}>Reject</button>
                      </div>
                    ) : <span className="text-xs text-slate-400">No action</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
