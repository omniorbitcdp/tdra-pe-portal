import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { reviewActionSchema } from '@/lib/validation';
import { canApproveKyc, canTransition, targetStatusFor, actionRequiresRemarks, type Action } from '@/lib/workflow';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import type { Role } from '@/lib/constants';
import type { Entity } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MODULE_TABLE: Record<string, string> = { HEADER: 'header_registrations', TEMPLATE: 'template_registrations', URL: 'url_registrations' };
const MODULE_ROLES: Record<string, Role[]> = {
  KYC: ['OPERATOR_KYC', 'ADMIN'],
  HEADER: ['OPERATOR_HEADER', 'ADMIN'],
  TEMPLATE: ['OPERATOR_TEMPLATE_URL', 'ADMIN'],
  URL: ['OPERATOR_TEMPLATE_URL', 'ADMIN'],
};

/** Generic approve / reject / request-correction / start-review for a module.
 *  Enforces role separation AND status-transition validity server-side. */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const module = String(body.module ?? '');
    const id = String(body.id ?? '');
    if (!module || !MODULE_ROLES[module]) return badRequest('Invalid module.');
    if (!MODULE_ROLES[module].includes(s!.role)) return json({ ok: false, error: 'Your role cannot action this module.' }, 403);

    const parsed = reviewActionSchema.safeParse(body);
    if (!parsed.success) return badRequest('Invalid action.');
    const action = parsed.data.action as Action;
    const remarks = (parsed.data.remarks ?? '').trim();
    if (actionRequiresRemarks(action) && remarks.length < 3) return badRequest('Remarks are required for rejection / correction requests.');

    // ---- KYC module operates on the entity record ----
    if (module === 'KYC') {
      const { data: entity } = await db().from('entities').select('*').eq('id', id).maybeSingle<Entity>();
      if (!entity) return notFound('Entity not found.');
      const to = targetStatusFor(action);
      if (!canTransition(entity.kyc_status, to)) return json({ ok: false, error: `Cannot move KYC from ${entity.kyc_status} to ${to}.` }, 409);
      if (action === 'APPROVE') {
        const { data: docs } = await db().from('kyc_documents').select('doc_type,status').eq('entity_id', id);
        const gate = canApproveKyc((docs ?? []) as Array<{ doc_type: never; status: string }>, entity.kyc_info_approved);
        if (!gate.ok) return json({ ok: false, error: gate.reason }, 409);
      }
      await db().from('entities').update({ kyc_status: to }).eq('id', id);
      await logAudit({ entity_id: id, module: 'KYC', record_id: id, action, actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: entity.kyc_status, to_status: to, remarks: remarks || null });
      await notify(module, action, entity.official_email ?? s!.email, remarks);
      return json({ ok: true, status: to });
    }

    // ---- Header / Template / URL ----
    const table = MODULE_TABLE[module];
    const { data: record } = await db().from(table).select('*').eq('id', id).maybeSingle();
    if (!record) return notFound('Record not found.');
    const to = targetStatusFor(action);
    if (!canTransition(record.status, to)) return json({ ok: false, error: `Cannot move ${module} from ${record.status} to ${to}.` }, 409);

    const { error } = await db().from(table).update({ status: to, remarks: remarks || record.remarks, decided_at: new Date().toISOString(), decided_by: s!.uid }).eq('id', id);
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: record.entity_id, module, record_id: id, action, actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: record.status, to_status: to, remarks: remarks || null });
    const { data: entity } = await db().from('entities').select('official_email').eq('id', record.entity_id).maybeSingle();
    await notify(module, action, entity?.official_email ?? s!.email, remarks);
    return json({ ok: true, status: to });
  } catch (e) { return serverError(e); }
}

async function notify(module: string, action: Action, recipient: string, remarks: string) {
  const map: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_CORRECTION: 'RESUBMISSION' };
  const suffix = map[action];
  if (!suffix) return;
  const event = `${module}_${suffix}`;
  const text = action === 'APPROVE'
    ? `Your ${module.toLowerCase()} registration has been approved.`
    : action === 'REJECT'
      ? `Your ${module.toLowerCase()} registration was rejected. Remarks: ${remarks}`
      : `Changes are required on your ${module.toLowerCase()} registration. Remarks: ${remarks}`;
  await sendNotification({ event, channel: 'EMAIL', recipient, vars: { recipient, subject: `${module} registration ${suffix.toLowerCase()}`, body: text } }).catch(() => undefined);
}
