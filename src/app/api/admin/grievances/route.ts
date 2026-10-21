import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, notFound, serverError } from '@/lib/http';
import { grievanceActionSchema } from '@/lib/validation';
import {
  GRIEVANCE_ACTION_TARGET, canGrievanceTransition, grievanceActionRequiresRemarks,
  hoursUntil, isOverdue, maskContact,
} from '@/lib/grievance';
import { logAudit } from '@/lib/audit';

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
      open: enriched.filter((r) => ['SUBMITTED', 'ACKNOWLEDGED'].includes(String(r.status))).length,
      overdue: enriched.filter((r) => r.overdue).length,
      unmatched: enriched.filter((r) => !r.entity_id).length,
    },
  });
}

/** Admin can close, reject or resolve any grievance, including unmatched ones. */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return badRequest('id is required.');
    const parsed = grievanceActionSchema.safeParse(body);
    if (!parsed.success) return badRequest('Invalid action.');

    const { data: row } = await db().from('grievances').select('*').eq('id', id).maybeSingle();
    if (!row) return notFound('Grievance not found.');

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
      patch.resolved_at = nowIso; patch.resolution_remarks = remarks;
      patch.resolved_by = s!.uid; patch.resolved_by_name = s!.name ?? s!.email;
    }
    if (action === 'CLOSE') patch.resolution_remarks = remarks || row.resolution_remarks;

    const { data: updated, error } = await db().from('grievances').update(patch).eq('id', id).select('*').single();
    if (error) return badRequest(error.message);

    await logAudit({
      entity_id: row.entity_id ?? null, module: 'GRIEVANCE', record_id: id, action: `ADMIN_${action}`,
      actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role,
      from_status: row.status, to_status: to, remarks: remarks || null,
    });
    return json({ ok: true, grievance: updated });
  } catch (e) { return serverError(e); }
}
