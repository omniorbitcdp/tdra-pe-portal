import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, notFound, serverError } from '@/lib/http';
import { grievanceActionSchema } from '@/lib/validation';
import {
  GRIEVANCE_OPEN, GRIEVANCE_WITH_ADMIN,
  actionsFor, canGrievanceTransition, grievanceActionRequiresRemarks,
  hoursUntil, isOverdue, maskContact,
} from '@/lib/grievance';
import { auditActionFor, buildGrievancePatch } from '@/lib/grievanceTransitions';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Administrators see every grievance, matched or not. */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;

  const statusFilter = req.nextUrl.searchParams.get('status');
  const unmatched = req.nextUrl.searchParams.get('unmatched') === '1';

  let query = db().from('grievances').select('*').order('created_at', { ascending: false }).limit(300);
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data } = await query;
  let rows = (data ?? []).map((r) => ({
    ...r,
    reporter: maskContact(r.subscriber_email || r.subscriber_mobile),
    overdue: isOverdue(r.status, r.sla_due_at),
    hours_remaining: hoursUntil(r.sla_due_at),
    actions: actionsFor('ADMIN', r.status),
  }));
  if (unmatched) rows = rows.filter((r) => !r.entity_id);

  const names = Array.from(new Set(rows.map((r) => r.entity_id).filter(Boolean) as string[]));
  const { data: entities } = names.length
    ? await db().from('entities').select('id,legal_entity_name').in('id', names)
    : { data: [] as Array<{ id: string; legal_entity_name: string }> };
  const nameById = new Map((entities ?? []).map((e) => [e.id as string, e.legal_entity_name as string]));
  const enriched = rows.map((r) => ({ ...r, enterprise: r.entity_id ? nameById.get(r.entity_id) ?? '—' : null }));

  return json({
    ok: true,
    grievances: enriched,
    summary: {
      total: enriched.length,
      open: enriched.filter((r) => GRIEVANCE_OPEN.includes(r.status as never)).length,
      escalated: enriched.filter((r) => r.status === 'ESCALATED').length,
      overdue: enriched.filter((r) => r.overdue).length,
      unmatched: enriched.filter((r) => !r.entity_id).length,
    },
  });
}

/** Return to the enterprise for justification, resolve, decline or close. */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
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

    if (!actionsFor('ADMIN', row.status).includes(action)) {
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
      entity_id: row.entity_id ?? null, module: 'GRIEVANCE', record_id: id,
      action: auditActionFor(action, s!.role),
      actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role,
      from_status: row.status, to_status: to, remarks: remarks || null,
    });

    // The enterprise must hear about a case sent back to it.
    if (action === 'RETURN_TO_PE' && row.entity_id) {
      const { data: entity } = await db().from('entities').select('official_email').eq('id', row.entity_id).maybeSingle();
      const to2 = (entity?.official_email as string) || null;
      if (to2) {
        await sendNotification({
          event: 'GRIEVANCE_RETURNED', channel: 'EMAIL', recipient: to2,
          vars: { recipient: to2, subject: `Grievance ${row.grievance_code ?? ''} returned`,
            body: `Grievance ${row.grievance_code ?? ''} was returned to you for justification: ${remarks}` },
        }).catch(() => undefined);
      }
    }
    if (row.subscriber_email && action !== 'RETURN_TO_PE') {
      await sendNotification({
        event: 'GRIEVANCE_UPDATED', channel: 'EMAIL', recipient: row.subscriber_email,
        vars: { recipient: row.subscriber_email, subject: `Grievance ${row.grievance_code ?? ''} — ${to.toLowerCase()}`,
          body: `Your grievance ${row.grievance_code ?? ''} is now ${to.replace(/_/g, ' ').toLowerCase()}. ${remarks}`.trim() },
      }).catch(() => undefined);
    }

    return json({ ok: true, grievance: { ...updated, actions: actionsFor('ADMIN', updated.status) } });
  } catch (e) { return serverError(e); }
}
