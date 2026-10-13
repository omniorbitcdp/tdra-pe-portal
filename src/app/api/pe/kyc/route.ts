import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { validateKycFile } from '@/lib/validation';
import { getSettings } from '@/lib/settings';
import { uploadKycFile, kycStoragePath } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { MANDATORY_DOC_TYPES } from '@/lib/constants';
import type { Entity } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return json({ ok: true, documents: [], mandatory: MANDATORY_DOC_TYPES });
  const { data } = await db().from('kyc_documents').select('*').eq('entity_id', entityId);
  return json({ ok: true, documents: data ?? [], mandatory: MANDATORY_DOC_TYPES });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Create your entity profile before uploading KYC documents.');
  try {
    const settings = await getSettings();
    const form = await req.formData();
    const docType = String(form.get('doc_type') ?? '');
    const file = form.get('file') as File | null;
    if (!MANDATORY_DOC_TYPES.includes(docType as never)) return badRequest('Invalid document type.');
    if (!file) return badRequest('No file provided.');

    const check = validateKycFile({ name: file.name, type: file.type, size: file.size }, { maxMb: settings.maxKycFileMb, allowedMime: settings.allowedKycMime });
    if (!check.ok) return badRequest(check.error ?? 'File rejected.');

    const { data: entity } = await db().from('entities').select('*').eq('id', entityId).maybeSingle<Entity>();
    // Once KYC is approved the pack is frozen — an approved entity must not
    // silently lose a verified document.
    if (entity?.kyc_status === 'APPROVED') {
      return json({ ok: false, error: 'KYC is already approved. Contact the operator to change a verified document.' }, 409);
    }

    const path = kycStoragePath(entityId, docType, file.name);
    await uploadKycFile(path, await file.arrayBuffer(), file.type);

    const { data: existing } = await db().from('kyc_documents').select('id,version')
      .eq('entity_id', entityId).eq('doc_type', docType).maybeSingle();
    const payload = {
      entity_id: entityId, doc_type: docType, file_name: file.name, storage_path: path,
      mime_type: file.type, size_bytes: file.size, status: 'PENDING_VERIFICATION' as const, remarks: null,
      uploaded_by: s!.uid, uploaded_at: new Date().toISOString(), verified_by: null, verified_at: null,
    };
    const res = existing
      ? await db().from('kyc_documents').update({ ...payload, version: (existing.version ?? 1) + 1 }).eq('id', existing.id).select('*').single()
      : await db().from('kyc_documents').insert(payload).select('*').single();
    if (res.error) return badRequest(res.error.message);

    // A replacement returns the item to the PE's draft/submission flow.
    if (['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'CLARIFICATION_REQUIRED', 'REJECTED', 'DRAFT'].includes(entity?.kyc_status ?? 'DRAFT')) {
      await db().from('entities').update({ kyc_status: 'DRAFT' }).eq('id', entityId);
    }
    await logAudit({ entity_id: entityId, module: 'DOCUMENT', record_id: res.data.id, action: existing ? 'REPLACE' : 'UPLOAD', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: existing ? 'REPLACED' : null, to_status: 'PENDING_VERIFICATION', remarks: docType });
    return json({ ok: true, document: res.data });
  } catch (e) { return serverError(e); }
}
