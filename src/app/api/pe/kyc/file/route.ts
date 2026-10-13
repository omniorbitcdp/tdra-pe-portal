import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, notFound, serverError, forbidden } from '@/lib/http';
import { signedKycUrl } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Signed, short-lived URL for a KYC document. PE may only access its own
 *  entity's documents; reviewers by role (§5, §11). */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE', 'OPERATOR_KYC', 'ADMIN']); if (g) return g;
  try {
    const docId = req.nextUrl.searchParams.get('docId');
    if (!docId) return badRequest('docId is required.');
    const { data: doc } = await db().from('kyc_documents').select('*').eq('id', docId).maybeSingle();
    if (!doc) return notFound('Document not found.');
    if (s!.role === 'PE' && doc.entity_id !== (await resolveEntityId(s))) return forbidden('Not your document.');
    const url = await signedKycUrl(doc.storage_path, 300);
    if (!url) return json({ ok: false, error: 'Could not sign document URL (check storage bucket/config).' }, 502);
    await logAudit({ entity_id: doc.entity_id, module: 'DOCUMENT', record_id: doc.id, action: 'VIEW', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: null, remarks: doc.doc_type });
    return json({ ok: true, url, expires_in: 300, document: doc });
  } catch (e) { return serverError(e); }
}
