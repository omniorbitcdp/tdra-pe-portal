import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, notFound, serverError } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { DOC_STATUSES } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Reviewer sets an individual document's verification status (§5, §7.2).
 *  Body: { docId, status, remarks? }  Rejection / resubmission require remarks. */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['OPERATOR_KYC', 'ADMIN']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const docId = String(body.docId ?? '');
    const status = String(body.status ?? '');
    const remarks = String(body.remarks ?? '').trim();
    if (!docId) return badRequest('docId is required.');
    if (!DOC_STATUSES.includes(status as never)) return badRequest('Invalid document status.');
    if ((status === 'REJECTED' || status === 'RESUBMISSION_REQUIRED') && remarks.length < 3) {
      return badRequest('Remarks are required when rejecting or requesting resubmission.');
    }
    const { data: doc } = await db().from('kyc_documents').select('*').eq('id', docId).maybeSingle();
    if (!doc) return notFound('Document not found.');

    const { data: updated, error } = await db().from('kyc_documents').update({
      status, remarks: remarks || null,
      verified_by: status === 'VERIFIED' ? s!.uid : doc.verified_by,
      verified_at: status === 'VERIFIED' ? new Date().toISOString() : doc.verified_at,
    }).eq('id', docId).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: doc.entity_id, module: 'DOCUMENT', record_id: docId, action: 'VERIFY_DOCUMENT', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: doc.status, to_status: status, remarks: remarks || doc.doc_type });
    return json({ ok: true, document: updated });
  } catch (e) { return serverError(e); }
}
