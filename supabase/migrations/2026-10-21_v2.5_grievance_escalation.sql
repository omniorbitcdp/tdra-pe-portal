-- ===========================================================================
-- v2.5 — grievance escalation, return-to-enterprise and re-open
--
--   SUBMITTED → ACKNOWLEDGED → RESOLVED/REJECTED → CLOSED
--                     ↘ ESCALATED → RETURNED_TO_PE
--   RESOLVED / REJECTED / CLOSED → REOPENED
--
-- Idempotent: safe to re-run.
-- ===========================================================================

alter table grievances add column if not exists escalated_at        timestamptz;
alter table grievances add column if not exists escalated_by        uuid references app_users(id) on delete set null;
alter table grievances add column if not exists escalated_by_name   text;
alter table grievances add column if not exists escalated_by_role   text;
alter table grievances add column if not exists escalation_reason   text;

alter table grievances add column if not exists returned_at         timestamptz;
alter table grievances add column if not exists returned_by         uuid references app_users(id) on delete set null;
alter table grievances add column if not exists returned_by_name    text;
alter table grievances add column if not exists return_reason       text;

alter table grievances add column if not exists reopened_at         timestamptz;
alter table grievances add column if not exists reopened_by         text;   -- 'SUBSCRIBER' | 'ADMIN'
alter table grievances add column if not exists reopen_reason        text;
alter table grievances add column if not exists reopen_count         integer not null default 0;

alter table grievances add column if not exists closed_at           timestamptz;
alter table grievances add column if not exists closed_by           uuid references app_users(id) on delete set null;
alter table grievances add column if not exists closed_by_name      text;

-- Widen the status domain to the full lifecycle.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'grievances'::regclass
      and contype = 'c'
      and (conname ilike '%status%' or pg_get_constraintdef(oid) ilike 'CHECK ((status%')
  loop
    execute format('alter table grievances drop constraint %I', c.conname);
  end loop;
end $$;

alter table grievances add constraint grievances_status_check check (status in (
  'SUBMITTED','ACKNOWLEDGED','RESOLVED','REJECTED','CLOSED',
  'ESCALATED','RETURNED_TO_PE','REOPENED'));

comment on column grievances.escalation_reason is 'Why the must be reviewed by the platform administrator';
comment on column grievances.return_reason     is 'Administrator instruction sent back to the enterprise';
comment on column grievances.reopen_count      is 'How many times the reporter has re-opened this grievance';

-- Repair rows concluded before closed_at was written.
update grievances set closed_at = coalesce(closed_at, resolved_at, updated_at)
where status = 'CLOSED' and closed_at is null;

create index if not exists idx_grievance_escalated on grievances(escalated_at desc) where escalated_at is not null;

select
  (select count(*) from information_schema.columns where table_name='grievances' and column_name='escalated_at') as escalation_columns,
  (select count(*) from information_schema.columns where table_name='grievances' and column_name='reopened_at')  as reopen_columns,
  (select count(*) from grievances) as grievances,
  (select pg_get_constraintdef(oid) from pg_constraint where conname='grievances_status_check') as status_check;
