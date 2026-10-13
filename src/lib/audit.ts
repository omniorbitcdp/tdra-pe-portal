// Append-only audit trail (requirements §7.1, §11, §12).
// Records WHO did it — actor id, name, email and role — plus the status change.
import { db } from './db';
import type { AuditEntry } from './types';

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db().from('audit_log').insert({
      entity_id: entry.entity_id,
      module: entry.module,
      record_id: entry.record_id,
      action: entry.action,
      actor_id: entry.actor_id,
      actor_name: entry.actor_name ?? null,
      actor_email: entry.actor_email,
      actor_role: entry.actor_role,
      from_status: entry.from_status,
      to_status: entry.to_status,
      remarks: entry.remarks,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    // Audit must never break the primary action; surface to server logs.
    console.error('[audit] failed to write entry', e);
  }
}
