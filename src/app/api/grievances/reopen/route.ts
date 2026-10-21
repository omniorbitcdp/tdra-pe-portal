import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { json, badRequest, notFound } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import {
  actionsFor, contactMatches, grievanceActionRequiresRemarks, canGrievanceTransition,
} from '@/lib/grievance';
import { auditActionFor, buildGrievancePatch } from '@/lib/grievanceTransitions';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** The reporter may re-open a concluded grievance or escalate it to the
 *  platform administrator. Authorised by grievance ID + the contact they filed
 *  with, exactly like tracking. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`grievance-reopen:${ip}`, { max: 15, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return json({ ok: false, error: 'Too many requests. Please try again later.' }, 429);

  const body = await req.json().catch(() => ({}));
  const code = String(body.grievanceId ?? '').trim().toUpperCase();
  const contact = String(body.contact ?? '').trim();
  const action = String(body.action ?? '').trim();
  const reason = String(body.reason ?? '').trim();

  if (!code || !contact) return badRequest('Grievance ID and the contact you filed with are required.');
  if (!['REOPEN', 'ESCALATE'].includes(action)) return badRequest('Choose re-open or escalate.');

  const { data: row } = await db().from('grievances').select('*').eq('grievance_code', code).maybeSingle();
  if (!row || !contactMatches(contact, row)) return notFound('No grievance found for that ID and contact.');

  if (!actionsFor('SUBSCRIBER', row.status).includes(action as never)) {
    return json({ ok: false, error: `A grievance in status ${row.status} cannot be ${action === 'REOPEN' ? 're-opened' : 'escalated'}.` }, 409);
  }
  if (grievanceActionRequiresRemarks(action as never) && reason.length < 5) {
    return badRequest('Tell us briefly why (at least 5 characters).');
  }

  const settings = await getSettings();
  const { to, patch } = buildGrievancePatch(row, action as never, reason, {
    id: null, name: row.subscriber_name ?? null, role: 'SUBSCRIBER',
  }, { slaHours: settings.grievanceSlaHours });

  if (!canGrievanceTransition(row.status, to as never)) {
    return json({ ok: false, error: `Cannot move a grievance from ${row.status} to ${to}.` }, 409);
  }

  const { data: updated, error } = await db().from('grievances').update(patch).eq('id', row.id).select('*').single();
  if (error) return badRequest(error.message);

  await logAudit({
    entity_id: row.entity_id ?? null, module: 'GRIEVANCE', record_id: row.id,
    action: auditActionFor(action as never, 'SUBSCRIBER'),
    actor_id: null, actor_email: row.subscriber_email ?? null, actor_name: row.subscriber_name ?? null,
    actor_role: 'SUBSCRIBER', from_status: row.status, to_status: to, remarks: reason,
  });

  if (action === 'ESCALATE') {
    const { data: admins } = await db().from('app_users').select('email,status').eq('role', 'ADMIN');
    for (const a of admins ?? []) {
      const to2 = (a as { email?: string }).email;
      if ((a as { status?: string }).status === 'ACTIVE' && to2) {
        await sendNotification({
          event: 'GRIEVANCE_ESCALATED', channel: 'EMAIL', recipient: to2,
          vars: { recipient: to2, subject: `Subscriber escalated ${row.grievance_code ?? ''}`,
            body: `The reporter escalated grievance ${row.grievance_code ?? ''}: ${reason}` },
        }).catch(() => undefined);
      }
    }
  } else if (row.entity_id) {
    const { data: entity } = await db().from('entities').select('official_email').eq('id', row.entity_id).maybeSingle();
    const to2 = (entity?.official_email as string) || null;
    if (to2) {
      await sendNotification({
        event: 'GRIEVANCE_REOPENED', channel: 'EMAIL', recipient: to2,
        vars: { recipient: to2, subject: `Grievance ${row.grievance_code ?? ''} re-opened`,
          body: `The reporter re-opened grievance ${row.grievance_code ?? ''}: ${reason}` },
      }).catch(() => undefined);
    }
  }

  return json({ ok: true, grievance: { grievance_code: updated.grievance_code, status: updated.status } });
}
