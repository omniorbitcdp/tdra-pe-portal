// Single place that turns an action into the database patch, so the enterprise,
// administrator and subscriber paths can never diverge.
import { GRIEVANCE_ACTION_TARGET, type GrievanceAction } from './grievance';
import { slaDueFrom } from './grievance';

export interface GrievanceRow {
  status: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  resolution_remarks?: string | null;
  reopen_count?: number | null;
  [k: string]: unknown;
}

export interface Actor { id: string | null; name: string | null; role: string }

export interface ApplyOptions { slaHours: number }

/** Returns the exact column patch for an action, including every timestamp the
 *  timeline depends on. */
export function buildGrievancePatch(
  row: GrievanceRow,
  action: GrievanceAction,
  remarks: string,
  actor: Actor,
  opts: ApplyOptions,
): { to: string; patch: Record<string, unknown> } {
  const to = GRIEVANCE_ACTION_TARGET[action];
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to };

  switch (action) {
    case 'ACKNOWLEDGE':
      patch.acknowledged_at = row.acknowledged_at ?? nowIso;
      break;

    case 'RESOLVE':
    case 'REJECT':
      // An enterprise that concludes in one step has implicitly acknowledged.
      patch.acknowledged_at = row.acknowledged_at ?? nowIso;
      patch.resolved_at = nowIso;
      patch.resolution_remarks = remarks;
      patch.resolved_by = actor.id;
      patch.resolved_by_name = actor.name;
      break;

    case 'CLOSE':
      patch.closed_at = nowIso;
      patch.closed_by = actor.id;
      patch.closed_by_name = actor.name;
      if (remarks) patch.resolution_remarks = remarks;
      break;

    case 'ESCALATE':
      patch.escalated_at = nowIso;
      patch.escalated_by = actor.id;
      patch.escalated_by_name = actor.name;
      patch.escalated_by_role = actor.role;
      patch.escalation_reason = remarks;
      break;

    case 'RETURN_TO_PE':
      patch.returned_at = nowIso;
      patch.returned_by = actor.id;
      patch.returned_by_name = actor.name;
      patch.return_reason = remarks;
      // A fresh window for the enterprise to respond.
      patch.sla_due_at = slaDueFrom(new Date(), opts.slaHours).toISOString();
      break;

    case 'REOPEN':
      patch.reopened_at = nowIso;
      patch.reopened_by = actor.role === 'SUBSCRIBER' ? 'SUBSCRIBER' : 'ADMIN';
      patch.reopen_reason = remarks;
      patch.reopen_count = Number(row.reopen_count ?? 0) + 1;
      // Prior resolution is kept for the audit trail; the timeline shows both.
      patch.sla_due_at = slaDueFrom(new Date(), opts.slaHours).toISOString();
      break;
  }
  return { to, patch };
}

/** Audit action name, distinguishing an administrator from the enterprise. */
export function auditActionFor(action: GrievanceAction, actorRole: string): string {
  if (actorRole === 'ADMIN') return `ADMIN_${action}`;
  if (actorRole === 'SUBSCRIBER') return `SUBSCRIBER_${action}`;
  return action;
}
