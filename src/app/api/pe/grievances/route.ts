import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, notFound, forbidden, serverError } from '@/lib/http';
import { grievanceActionSchema } from '@/lib/validation';
import {
  GRIEVANCE_OPEN, GRIEVANCE_CONCLUDED, GRIEVANCE_WITH_ADMIN,
  actionsFor, canGrievanceTransition, grievanceActionRequiresRemarks,
  hoursUntil, isOverdue, maskContact,
} from '@/lib/grievance';
import { auditActionFor, buildGrievancePatch } from '@/lib/grievanceTransitions';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Grievances matched to the caller's entity — by header only. Escalated cases
 *  stay visible here so the enterprise can follow what telco is reviewing. */
export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return json({ ok: true, grievances: [], summary: { open: 0, overdue: 0, resolved: 0, escalated: 0, total: 0 } });

  const { data } = await db().from('grievances').select('*')
    .eq('entity_id', entityId).order('created_at', { ascending: false }).limit(200);

  const rows = (data ?? []).map((r) => ({
    ...r,
    reporter: maskContact(r.subscriber_email || r.subscriber_mobile),
    overdue: isOverdue(r.status, r.sla_due_at),
    hours_remaining: hoursUntil(r.sla_due_at),
    actions: actionsFor('PE', r.status),
  }));

  const summary = {
    open: rows.filter((r) => GRIEVANCE_OPEN.includes(r.status as never)).length,
    overdue: rows.filter((r) => r.overdue).length,
    resolved: rows.filter((r) => r.status === 'RESOLVED').length,
    escalated: rows.filter((r) => GRIEVANCE_WITH_ADMIN.includes(r.status as never) || r.escalated_at).length,
    total: rows.length,
  };
  return json({ ok: true, grievances: rows, summary });
}

/** Any enterprise action: acknowledge, resolve, decline, close, escalate. */
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
    const action = parsed.data.action;
    const remarks = (parsed.data.remarks ?? '').trim();

    const { data: row } = await db().from('grievances').select('*').eq('id', id).maybeSingle();
    if (!row) return notFound('Grievance not found.');
    if (row.entity_id !== entityId) return forbidden('This grievance belongs to another enterprise.');

    if (!actionsFor('PE', row.status).includes(action)) {
      return json({ ok: false, error: `This grievance cannot be ${action.toLowerCase().replace(/_/g, ' ')}d from status ${row.status}.` }, 409);
    }
    if (grievanceActionRequiresRemarks(action) && remarks.length < 5) {
      return badRequest('Add a short note explaining the outcome (at least 5 characters).');
    }

    const settings = await getSettings();
    const { to, patch } = buildGrievancePatch(row, action, remarks, {
      id: s!.uid, name: s!.name ?? s!.email, role: s!.role,
    }, { slaHours: settings.grievanceSlaHours });

    if (!canGrievanceTransition(row.status, to as never)) {
      return json({ ok: false, error: `Cannot move a grievance from ${row.status} to ${to}.` }, 409);
    }

    const { data: updated, error } = await db().from('grievances').update(patch).eq('id', id).select('*').single();
    if (error) return badRequest(error.message);

    await logAudit({
      entity_id: entityId, module: 'GRIEVANCE', record_id: id, action: auditActionFor(action, s!.role),
      actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role,
      from_status: row.status, to_status: to, remarks: remarks || null,
      metadata: action === 'ESCALATE' ? { escalated_to: 'ADMIN' } : undefined,
    });

    // Escalations alert every administrator; everything else tells the reporter.
    if (action === 'ESCALATE') {
      const { data: admins } = await db().from('app_users').select('email,status').eq('role', 'ADMIN');
      for (const a of admins ?? []) {
        const to2 = (a as { email?: string }).email;
        if ((a as { status?: string }).status === 'ACTIVE' && to2) {
          await sendNotification({
            event: 'GRIEVANCE_ESCALATED', channel: 'EMAIL', recipient: to2,
            vars: { recipient: to2, subject: `Escalated grievance ${row.grievance_code ?? ''}`,
              body: `An enterprise escalated grievance ${row.grievance_code ?? ''}. Reason: ${remarks}` },
          }).catch(() => undefined);
        }
      }
    } else if (row.subscriber_email) {
      await sendNotification({
        event: 'GRIEVANCE_UPDATED', channel: 'EMAIL', recipient: row.subscriber_email,
        vars: { recipient: row.subscriber_email, subject: `Grievance ${row.grievance_code ?? ''} — ${to.toLowerCase()}`,
          body: `Your grievance ${row.grievance_code ?? ''} is now ${to.replace(/_/g, ' ').toLowerCase()}. ${remarks}`.trim() },
      }).catch(() => undefined);
    }

    return json({ ok: true, grievance: { ...updated, actions: actionsFor('PE', updated.status) } });
  } catch (e) { return serverError(e); }
}
