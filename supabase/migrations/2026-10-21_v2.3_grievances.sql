-- ===========================================================================
-- v2.3 — GRIEVANCE REGISTRATION
--
-- A subscriber (no account) reports an SMS they received. The grievance is
-- matched to a Principal Entity SOLELY by the header/sender ID it names, and
-- appears in that entity's queue. The platform administrator sees every
-- grievance, including unmatched ones.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

create table if not exists grievances (
  id                  uuid primary key default gen_random_uuid(),
  grievance_code      text unique,                         -- GRV-XXXXXXXX (trigger)
  -- what the subscriber told us ------------------------------------------------
  reported_header     text not null,                       -- exactly as typed
  header_id           uuid references header_registrations(id) on delete set null,
  entity_id           uuid references entities(id) on delete set null,  -- matched PE
  message_content     text not null,                       -- received SMS body
  highlighted_url     text,                                -- suspicious link
  highlighted_phone   text,                                -- fraudulent originator
  category            text not null default 'FRAUD'
                        check (category in ('FRAUD','PHISHING','SPAM','UNSOLICITED','OTHER')),
  description         text,
  -- who reported it (used to authorise tracking; no account required) ----------
  subscriber_name     text,
  subscriber_email    text,
  subscriber_mobile   text not null,
  -- evidence ------------------------------------------------------------------
  attachment_path     text,
  attachment_name     text,
  attachment_mime     text,
  attachment_size     bigint,
  -- lifecycle -----------------------------------------------------------------
  status              text not null default 'SUBMITTED'
                        check (status in ('SUBMITTED','ACKNOWLEDGED','RESOLVED','REJECTED','CLOSED')),
  sla_due_at          timestamptz not null default (now() + interval '48 hours'),
  acknowledged_at     timestamptz,
  resolved_at         timestamptz,
  resolution_remarks  text,
  resolved_by         uuid references app_users(id) on delete set null,
  resolved_by_name    text,
  match_method        text,                                -- SENDER_ID | HEADER_NAME | HEADER_CODE | NONE
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_grievance_entity   on grievances(entity_id, created_at desc);
create index if not exists idx_grievance_status   on grievances(status, created_at desc);
create index if not exists idx_grievance_code     on grievances(grievance_code);
create index if not exists idx_grievance_header   on grievances(header_id);
create index if not exists idx_grievance_sla      on grievances(sla_due_at) where status in ('SUBMITTED','ACKNOWLEDGED');

drop trigger if exists trg_grievance_updated on grievances;
create trigger trg_grievance_updated before update on grievances
  for each row execute function set_updated_at();

-- GRV- + 8 random digits, reusing the shared allocator.
create or replace function assign_grievance_code()
returns trigger language plpgsql as $$
begin
  if new.grievance_code is null then
    new.grievance_code := allocate_ref_code('GRV', 'grievances', 'grievance_code', 8);
  end if;
  return new;
end; $$;

drop trigger if exists trg_grievance_code on grievances;
create trigger trg_grievance_code before insert on grievances
  for each row execute function assign_grievance_code();

-- Table-level security: the API uses the service role and enforces access in
-- code, exactly as for every other table.
alter table grievances enable row level security;
drop policy if exists no_anon_access on grievances;
create policy no_anon_access on grievances for all to anon, authenticated
  using (false) with check (false);

-- Private bucket for the screenshot the subscriber uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grievance-attachments','grievance-attachments', false, 5242880,
        array['image/jpeg','image/jpg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SLA window, editable in the admin settings screen.
insert into platform_settings (key, value)
values ('grievance_sla_hours', '{"value": 48}'::jsonb)
on conflict (key) do nothing;

-- Repair rows actioned before acknowledged_at was written alongside the status.
update grievances
set acknowledged_at = coalesce(acknowledged_at, resolved_at, updated_at)
where status in ('ACKNOWLEDGED','RESOLVED','REJECTED','CLOSED')
  and acknowledged_at is null;

select
  (select count(*) from information_schema.tables where table_name = 'grievances') as grievances_table,
  (select count(*) from storage.buckets where id = 'grievance-attachments')         as bucket,
  (select count(*) from platform_settings where key = 'grievance_sla_hours')        as sla_setting;
