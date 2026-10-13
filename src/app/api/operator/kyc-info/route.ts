import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, notFound } from '@/lib/http';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Reviewer marks the submitted PE information as approved / not approved.
 *  KYC approval is blocked until this is true (§5, §7.2). */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['OPERATOR_KYC', 'ADMIN']); if (g) return g;
  const body = await req.json().catch(() => ({}));
  const entityId = String(body.entityId ?? '');
  const approve = Boolean(body.approve);
  if (!entityId) return badRequest('entityId is required.');
  const { data: entity } = await db().from('entities').select('*').eq('id', entityId).maybeSingle();
  if (!entity) return notFound('Entity not found.');
  await db().from('entities').update({ kyc_info_approved: approve }).eq('id', entityId);
  await logAudit({ entity_id: entityId, module: 'KYC', record_id: entityId, action: approve ? 'APPROVE_INFO' : 'REVOKE_INFO', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: String(entity.kyc_info_approved), to_status: String(approve), remarks: null });
  return json({ ok: true, kyc_info_approved: approve });
}
