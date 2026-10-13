-- ============================================================================
-- MIGRATION v1.4  —  Capture the approver's NAME in the audit trail
--
-- "Admin can see who has approved what": audit rows now record the reviewer's
-- full name alongside id, email and role. Existing rows are backfilled from
-- app_users via actor_id.
--
-- Idempotent. Run in Supabase → SQL Editor → New query → Run.
-- ============================================================================

alter table audit_log add column if not exists actor_name text;

-- Backfill from the user directory (name, falling back to email local-part)
update audit_log a
set actor_name = coalesce(u.full_name, split_part(u.email, '@', 1))
from app_users u
where a.actor_id = u.id
  and a.actor_name is null;

-- Speed up "what did person X do" and the audit filter screen
create index if not exists idx_audit_actor   on audit_log(actor_id, created_at desc);
create index if not exists idx_audit_action  on audit_log(action, created_at desc);

-- ============================================================================
-- Verify — who approved what:
--   select a.actor_name, a.actor_role, a.module, a.action,
--          a.from_status, a.to_status, a.remarks, a.created_at
--   from audit_log a
--   where a.action in ('APPROVE','REJECT','REQUEST_CORRECTION')
--   order by a.created_at desc;
-- ============================================================================
