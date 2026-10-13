import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, notFound } from '@/lib/http';
import { MANDATORY_DOC_TYPES } from '@/lib/constants';
import { isKycPackComplete } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

/** Split-screen KYC review payload: PE details + documents + history (§7.2). */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['OPERATOR_KYC', 'ADMIN']); if (g) return g;
  const entityId = req.nextUrl.searchParams.get('entityId');
  if (!entityId) return badRequest('entityId is required.');
  const client = db();
  const { data: entity } = await client.from('entities').select('*').eq('id', entityId).maybeSingle();
  if (!entity) return notFound('Entity not found.');
  const [docs, users, history] = await Promise.all([
    client.from('kyc_documents').select('*').eq('entity_id', entityId),
    client.from('app_users').select('id,email,full_name,status,created_at').eq('entity_id', entityId),
    client.from('audit_log').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }).limit(50),
  ]);
  const documents = docs.data ?? [];
  return json({
    ok: true, entity, documents, mandatory: MANDATORY_DOC_TYPES,
    packComplete: isKycPackComplete(documents as Array<{ doc_type: never; status: string }>),
    users: users.data ?? [], history: history.data ?? [],
  });
}
