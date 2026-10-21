import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, notFound, serverError } from '@/lib/http';
import { grievanceActionSchema } from '@/lib/validation';
import {
  GRIEVANCE_ACTION_TARGET, canGrievanceTransition, grievanceActionRequiresRemarks,
  hoursUntil, isOverdue, maskContact,
} from '@/lib/grievance';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** Grievances matched to the caller's entity — by header only. */
export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return json({ ok: true, grievances: [], summary: { open: 0, overdue: 0, resolved: 0, total: 0 } });

  const { data } = await db().from('grievances').select('*')
    .eq('entity_id', entityId).order('created_at', { ascending: false }).limit(200);

  const rows = (data ?? []).map((r) => ({
    ...r,
    reporter: maskContact(r.subscriber_email || r.subscriber_mobile),
    overdue: isOverdue(r.status, r.sla_due_at),
    hours_remaining: hoursUntil(r.sla_due_at),
  }));

  const summary = {
    open: rows.filter((r) => ['SUBMITTED', 'ACKNOWLEDGED'].includes(String(r.status))).length,
    overdue: rows.filter((r) => r.overdue).length,
    resolved: rows.filter((r) => r.status === 'RESOLVED').length,
    total: rows.length,
  };
  return json({ ok: true, grievances: rows, summary });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('No entity profile linked to this account.');
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return badRequest('id is required.');
    const parsed = grievanceActionSchema.safeParse(body);
    if (!parsed.success) return badRequest('Invalid action.');

    const { data: row } = await db().from('grievances').select('*').eq('id', id).maybeSingle();
    if (!row) return notFound('Grievance not found.');
    if (row.entity_id !== entityId) return json({ ok: false, error: 'This grievance belongs to another enterprise.' }, 403);

    const action = parsed.data.action;
    const remarks = (parsed.data.remarks ?? '').trim();
    if (grievanceActionRequiresRemarks(action) && remarks.length < 5) {
      return badRequest('Add a short note explaining the outcome (at least 5 characters).');
    }
    const to = GRIEVANCE_ACTION_TARGET[action];
    if (!canGrievanceTransition(row.status, to)) {
      return json({ ok: false, error: `Cannot move a grievance from ${row.status} to ${to}.` }, 409);
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { status: to };
    if (action === 'ACKNOWLEDGE') patch.acknowledged_at = nowIso;
    if (action === 'RESOLVE' || action === 'REJECT') {
      patch.acknowledged_at = row.acknowledged_at ?? nowIso;
      patch.resolved_at = nowIso;
      patch.resolution_remarks = remarks;
      patch.resolved_by = s!.uid;
      patch.resolved_by_name = s!.name ?? s!.email;
    }
    if (action === 'CLOSE') patch.resolution_remarks = remarks || row.resolution_remarks;

    const { data: updated, error } = await db().from('grievances').update(patch).eq('id', id).select('*').single();
    if (error) return badRequest(error.message);

    await logAudit({
      entity_id: entityId, module: 'GRIEVANCE', record_id: id, action,
      actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role,
      from_status: row.status, to_status: to, remarks: remarks || null,
    });

    const subject = `Grievance ${row.grievance_code ?? ''} — ${to.toLowerCase()}`;
    const bodyText = `Your grievance ${row.grievance_code ?? ''} has been marked ${to.toLowerCase()}. ${remarks}`.trim();
    if (row.subscriber_email) {
      await sendNotification({ event: 'GRIEVANCE_UPDATED', channel: 'EMAIL', recipient: row.subscriber_email, vars: { recipient: row.subscriber_email, subject, body: bodyText } }).catch(() => undefined);
    }

    return json({ ok: true, grievance: updated });
  } catch (e) { return serverError(e); }
}
