import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json } from '@/lib/http';
import { MANDATORY_DOC_TYPES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** PE status dashboard + history (§8). Scoped to the caller's own entity. */
export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = s!.entityId;
  if (!entityId) return json({ ok: true, entity: null, kyc: { status: 'NOT_STARTED', documents: [], complete: false }, headers: [], templates: [], urls: [], history: [] });

  const client = db();
  const [entity, docs, headers, templates, urls, history] = await Promise.all([
    client.from('entities').select('*').eq('id', entityId).maybeSingle(),
    client.from('kyc_documents').select('*').eq('entity_id', entityId),
    client.from('header_registrations').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
    client.from('template_registrations').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
    client.from('url_registrations').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
    client.from('audit_log').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }).limit(100),
  ]);
  const documents = docs.data ?? [];
  const verified = new Set(documents.filter((d: { status: string }) => d.status === 'VERIFIED').map((d: { doc_type: string }) => d.doc_type));
  const complete = MANDATORY_DOC_TYPES.every((t) => verified.has(t));
  return json({
    ok: true,
    entity: entity.data,
    kyc: { status: entity.data?.kyc_status ?? 'NOT_STARTED', documents, complete, mandatory: MANDATORY_DOC_TYPES },
    headers: headers.data ?? [], templates: templates.data ?? [], urls: urls.data ?? [],
    history: history.data ?? [],
  });
}
