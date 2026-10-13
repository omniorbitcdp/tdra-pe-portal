import { redirect } from 'next/navigation';
import { getSession, guard } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { db } from '@/lib/db';
import { MANDATORY_DOC_TYPES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function KycQueue() {
  const session = await getSession();
  if (!session) redirect('/login');
  const g = guard(session, ['OPERATOR_KYC', 'ADMIN']);
  if (g) return <Shell><Card><p className="text-sm text-rose-600">Your role cannot access the KYC queue.</p></Card></Shell>;

  const client = db();
  const { data: entities } = await client.from('entities').select('*').order('created_at', { ascending: false });
  const ids = (entities ?? []).map((e) => e.id);
  const { data: docs } = ids.length ? await client.from('kyc_documents').select('entity_id,doc_type,status').in('entity_id', ids) : { data: [] as Array<{ entity_id: string; doc_type: string; status: string }> };
  const byEntity = new Map<string, Array<{ doc_type: string; status: string }>>();
  for (const d of docs ?? []) {
    const arr = byEntity.get(d.entity_id) ?? []; arr.push(d); byEntity.set(d.entity_id, arr);
  }

  return (
    <Shell>
      <PageHeader title="KYC Approval Queue" subtitle="Section 7.2 — verify each document and approve the PE information" />
      <Card className="overflow-x-auto">
        {(entities ?? []).length === 0 ? <Empty>No entities submitted.</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">PE ID</th><th className="th">Entity</th><th className="th">Type</th><th className="th">KYC status</th><th className="th">Docs verified</th><th className="th">Info approved</th><th className="th"></th></tr></thead>
            <tbody>
              {(entities ?? []).map((e) => {
                const list = byEntity.get(e.id) ?? [];
                const verified = list.filter((d) => d.status === 'VERIFIED').length;
                const missing = MANDATORY_DOC_TYPES.filter((t) => !list.some((d) => d.doc_type === t));
                return (
                  <tr key={e.id}>
                    <td className="td font-mono text-xs">{e.entity_code ?? "—"}</td><td className="td font-medium">{e.legal_entity_name}</td>
                    <td className="td">{e.entity_type}</td>
                    <td className="td"><StatusPill status={e.kyc_status} /></td>
                    <td className="td">{verified} / 4 {missing.length > 0 && <span className="text-amber-700">· {missing.length} missing</span>}</td>
                    <td className="td">{e.kyc_info_approved ? 'Yes' : 'No'}</td>
                    <td className="td"><a className="btn-primary" href={`/operator/kyc/${e.id}`}>Review</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
