import { redirect } from 'next/navigation';
import { getSession, guard } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader, Card, StatusPill, Empty, StatCard, StatGrid, Avatar } from '@/components/ui';
import { MANDATORY_DOC_TYPES, REG_STATUS_LABELS } from '@/lib/constants';
import { getLang } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function KycQueue() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (guard(session, ['OPERATOR_KYC', 'ADMIN'])) redirect('/operator?denied=1');

  const lang = await getLang();
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);

  const client = db();
  const [{ data: entities }, { data: docs }, { data: lastDecisions }] = await Promise.all([
    client.from('entities').select('id,entity_code,legal_entity_name,entity_type,kyc_status,kyc_info_approved,signatory_name,created_at,updated_at').order('created_at', { ascending: false }).limit(300),
    client.from('kyc_documents').select('entity_id,doc_type,status'),
    client.from('audit_log').select('entity_id,action,actor_name,actor_email,remarks,created_at').eq('module','KYC').order('created_at', { ascending: false }).limit(200),
  ]);

  const byEntity = new Map<string, Array<{ doc_type: string; status: string }>>();
  for (const d of docs ?? []) {
    const arr = byEntity.get(d.entity_id) ?? []; arr.push(d); byEntity.set(d.entity_id, arr);
  }
  const lastBy = new Map<string, { actor_name: string | null; actor_email: string | null; action: string; created_at: string }>();
  for (const a of lastDecisions ?? []) {
    if (a.entity_id && !lastBy.has(a.entity_id)) lastBy.set(a.entity_id, a as never);
  }

  const list = entities ?? [];
  const count = (s: string[]) => list.filter((e) => s.includes(e.kyc_status)).length;
  const awaiting = count(['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED']);
  const awaitingPe = count(['CLARIFICATION_REQUIRED']);
  const approved = count(['APPROVED']);
  const rejected = count(['REJECTED']);
  const notSubmitted = count(['DRAFT']);

  return (
    <div>
      <PageHeader title={t('KYC Approval Queue')}
        subtitle={t('Verify each of the four mandatory documents, then approve the PE information and the KYC pack.')} />
      <StatGrid cols={5}>
        <StatCard label={t('Awaiting my action')} value={awaiting} tone="amber" />
        <StatCard label={t('Awaiting PE')} value={awaitingPe} tone="sky" />
        <StatCard label={t('Approved')} value={approved} tone="emerald" />
        <StatCard label={t('Rejected')} value={rejected} tone="rose" />
        <StatCard label={t('Not submitted yet')} value={notSubmitted} hint={t('PE has not pressed Submit KYC')} />
      </StatGrid>

      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          {list.length === 0 ? <div className="p-5"><Empty>{t('No entities registered yet.')}</Empty></div> : (
            <table className="table">
              <thead className="thead-row"><tr>
                <th className="th">{t('PE ID')}</th><th className="th">{t('Entity')}</th><th className="th">{t('Signatory')}</th>
                <th className="th">{t('KYC status')}</th><th className="th">{t('Documents')}</th><th className="th">{t('PE info')}</th>
                <th className="th">{t('Last action by')}</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {list.map((e) => {
                  const list2 = byEntity.get(e.id) ?? [];
                  const verified = list2.filter((d) => d.status === 'VERIFIED').length;
                  const missing = MANDATORY_DOC_TYPES.filter((ty) => !list2.some((d) => d.doc_type === ty));
                  const last = lastBy.get(e.id);
                  return (
                    <tr key={e.id} className="tr">
                      <td className="td whitespace-nowrap font-mono text-xs">{e.entity_code ?? '—'}</td>
                      <td className="td">
                        <div className="font-medium text-slate-800">{e.legal_entity_name}</div>
                        <div className="text-xs text-slate-400">{e.entity_type}</div>
                      </td>
                      <td className="td text-xs">{e.signatory_name ?? '—'}</td>
                      <td className="td">
                        <StatusPill status={e.kyc_status}
                          label={t(REG_STATUS_LABELS[e.kyc_status as keyof typeof REG_STATUS_LABELS] ?? e.kyc_status)} />
                      </td>
                      <td className="td text-xs">
                        <span className={verified === 4 ? 'text-emerald-600' : 'text-slate-600'}>{t('{n}/4 verified', { n: verified })}</span>
                        {missing.length > 0 && <div className="text-[11px] text-amber-700">{t('{n} missing', { n: missing.length })}</div>}
                      </td>
                      <td className="td text-xs">{e.kyc_info_approved
                        ? <span className="font-semibold text-emerald-600">{t('Approved')}</span>
                        : <span className="text-slate-400">{t('Not approved')}</span>}</td>
                      <td className="td">
                        {last ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={last.actor_name ?? last.actor_email ?? 'System'} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-slate-700">{last.actor_name ?? last.actor_email}</span>
                              <span className="block text-[10px] text-slate-400">{last.action.replace(/_/g, ' ')} · {new Date(last.created_at).toLocaleDateString()}</span>
                            </span>
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="td"><a className="btn-primary btn-sm" href={`/operator/kyc/${e.id}`}>{t('Review')}</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
