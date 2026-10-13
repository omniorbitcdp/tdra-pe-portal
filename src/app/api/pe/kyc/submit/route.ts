import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { canSubmitKycPack } from '@/lib/workflow';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import type { Entity, KycDocument } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * PE submits (or resubmits) their KYC pack for operator review.
 * Moves kyc_status DRAFT -> SUBMITTED (or CLARIFICATION_REQUIRED/REJECTED -> RESUBMITTED).
 * Gated on: all mandatory entity fields filled + all four TDRA documents uploaded (§4, §5, §6).
 */
export async function POST() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Create your entity profile before submitting KYC.');

  try {
    const { data: entity } = await db().from('entities').select('*').eq('id', entityId).maybeSingle<Entity>();
    if (!entity) return badRequest('Entity profile not found.');
    const { data: docs } = await db().from('kyc_documents').select('*').eq('entity_id', entityId);

    const gate = canSubmitKycPack(entity, (docs ?? []) as KycDocument[]);
    if (!gate.ok) return json({ ok: false, error: gate.reason, missingFields: gate.missingFields, missingDocuments: gate.missingDocuments }, 409);

    const from = entity.kyc_status;
    if (!['DRAFT', 'CLARIFICATION_REQUIRED', 'REJECTED'].includes(from)) {
      return json({ ok: false, error: `KYC is already ${from.replace(/_/g, ' ').toLowerCase()} and awaiting review.` }, 409);
    }
    const to = from === 'DRAFT' ? 'SUBMITTED' : 'RESUBMITTED';

    const { error } = await db().from('entities').update({ kyc_status: to }).eq('id', entityId);
    if (error) return badRequest(error.message);

    await logAudit({ entity_id: entityId, module: 'KYC', record_id: entityId, action: 'SUBMIT', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: from, to_status: to, remarks: `KYC pack submitted with ${(docs ?? []).length} document(s)` });
    await sendNotification({
      event: 'KYC_SUBMITTED', channel: 'EMAIL',
      recipient: entity.official_email ?? s!.email,
      vars: { recipient: entity.official_email ?? s!.email, subject: 'KYC submitted for review', body: `Your KYC submission for ${entity.legal_entity_name} is now pending review.` },
    }).catch(() => undefined);

    return json({ ok: true, status: to });
  } catch (e) { return serverError(e); }
}
