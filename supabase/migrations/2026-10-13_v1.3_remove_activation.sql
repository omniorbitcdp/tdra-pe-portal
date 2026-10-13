-- ============================================================================
-- MIGRATION v1.3  —  Remove the email-activation flow
--
-- Registration now creates a usable account immediately: email + password is
-- sufficient. Existing accounts parked in PENDING_ACTIVATION are switched to
-- ACTIVE, and the unused ACTIVATION token purpose is retired.
--
-- Idempotent. Run in Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- 1. Any account waiting on an activation link becomes usable -----------------
update app_users set status = 'ACTIVE' where status = 'PENDING_ACTIVATION';

-- 2. PENDING_ACTIVATION is no longer a valid account status -------------------
alter table app_users drop constraint if exists app_users_status_check;
alter table app_users add  constraint app_users_status_check
  check (status in ('ACTIVE','LOCKED','DISABLED'));

-- 3. Retire the ACTIVATION token purpose (ACTIVATION no longer issued) --------
delete from auth_tokens where purpose = 'ACTIVATION';

alter table auth_tokens drop constraint if exists auth_tokens_purpose_check;
alter table auth_tokens add  constraint auth_tokens_purpose_check
  check (purpose in ('PASSWORD_RESET','OTP_VERIFY'));

-- 4. Drop the activation policy setting ---------------------------------------
delete from platform_settings where key = 'require_activation';

-- ============================================================================
-- Verify — should return 0 rows:
--   select email, status from app_users where status = 'PENDING_ACTIVATION';
-- ============================================================================
