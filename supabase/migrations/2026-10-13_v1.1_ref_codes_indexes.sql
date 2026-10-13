-- ============================================================================
-- MIGRATION v1.1  —  Reference codes (PE / Header / Template / URL IDs)
--                    + performance indexes
-- Idempotent: safe to run on an EXISTING database that already has schema.sql.
-- Run in Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- 1. Sequences backing the human-readable reference numbers -------------------
create sequence if not exists ref_entity_seq;
create sequence if not exists ref_header_seq;
create sequence if not exists ref_template_seq;
create sequence if not exists ref_url_seq;

-- 2. Reference-code columns ---------------------------------------------------
alter table entities               add column if not exists entity_code   text;
alter table header_registrations   add column if not exists header_code   text;
alter table template_registrations add column if not exists template_code text;
alter table url_registrations      add column if not exists url_code      text;

-- 3. Backfill existing rows (sequential, oldest first) ------------------------
with n as (
  select id, row_number() over (order by created_at, id) rn
  from entities where entity_code is null
)
update entities e set entity_code = 'PE-' || lpad(n.rn::text, 6, '0') from n where e.id = n.id;

with n as (
  select id, row_number() over (order by created_at, id) rn
  from header_registrations where header_code is null
)
update header_registrations h set header_code = 'HDR-' || lpad(n.rn::text, 6, '0') from n where h.id = n.id;

with n as (
  select id, row_number() over (order by created_at, id) rn
  from template_registrations where template_code is null
)
update template_registrations t set template_code = 'TPL-' || lpad(n.rn::text, 6, '0') from n where t.id = n.id;

with n as (
  select id, row_number() over (order by created_at, id) rn
  from url_registrations where url_code is null
)
update url_registrations u set url_code = 'URL-' || lpad(n.rn::text, 6, '0') from n where u.id = n.id;

-- 4. Park each sequence after the highest number in use -----------------------
select setval('ref_entity_seq',   coalesce((select max(substring(entity_code   from 4)::bigint) from entities), 0)               + 1, false);
select setval('ref_header_seq',   coalesce((select max(substring(header_code   from 5)::bigint) from header_registrations), 0)   + 1, false);
select setval('ref_template_seq', coalesce((select max(substring(template_code from 5)::bigint) from template_registrations), 0) + 1, false);
select setval('ref_url_seq',      coalesce((select max(substring(url_code      from 5)::bigint) from url_registrations), 0)      + 1, false);

-- 5. Uniqueness ---------------------------------------------------------------
create unique index if not exists uq_entities_code   on entities(entity_code)                 where entity_code  is not null;
create unique index if not exists uq_header_code     on header_registrations(header_code)     where header_code  is not null;
create unique index if not exists uq_template_code   on template_registrations(template_code) where template_code is not null;
create unique index if not exists uq_url_code        on url_registrations(url_code)           where url_code     is not null;

-- 6. Auto-assign on every future insert ---------------------------------------
create or replace function assign_ref_code()
returns trigger language plpgsql as $$
declare n bigint;
begin
  if tg_table_name = 'entities' then
    if new.entity_code is null then
      n := nextval('ref_entity_seq');
      new.entity_code := 'PE-' || lpad(n::text, 6, '0');
    end if;
  elsif tg_table_name = 'header_registrations' then
    if new.header_code is null then
      n := nextval('ref_header_seq');
      new.header_code := 'HDR-' || lpad(n::text, 6, '0');
    end if;
  elsif tg_table_name = 'template_registrations' then
    if new.template_code is null then
      n := nextval('ref_template_seq');
      new.template_code := 'TPL-' || lpad(n::text, 6, '0');
    end if;
  elsif tg_table_name = 'url_registrations' then
    if new.url_code is null then
      n := nextval('ref_url_seq');
      new.url_code := 'URL-' || lpad(n::text, 6, '0');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_entity_code   on entities;
create trigger trg_entity_code   before insert on entities               for each row execute function assign_ref_code();
drop trigger if exists trg_header_code   on header_registrations;
create trigger trg_header_code   before insert on header_registrations   for each row execute function assign_ref_code();
drop trigger if exists trg_template_code on template_registrations;
create trigger trg_template_code before insert on template_registrations for each row execute function assign_ref_code();
drop trigger if exists trg_url_code      on url_registrations;
create trigger trg_url_code      before insert on url_registrations      for each row execute function assign_ref_code();

-- 7. Performance indexes ------------------------------------------------------
create index if not exists idx_entity_status_created   on entities(kyc_status, created_at desc);
create index if not exists idx_audit_entity_created    on audit_log(entity_id, created_at desc);
create index if not exists idx_audit_created           on audit_log(created_at desc);
create index if not exists idx_header_status_created   on header_registrations(status, created_at desc);
create index if not exists idx_template_status_created on template_registrations(status, created_at desc);
create index if not exists idx_url_status_created      on url_registrations(status, created_at desc);
create index if not exists idx_notif_created           on notifications_log(created_at desc);
create index if not exists idx_notif_channel           on notifications_log(channel, created_at desc);
create index if not exists idx_kycdoc_status           on kyc_documents(entity_id, status);

-- 8. Settings: activation policy ---------------------------------------------
insert into platform_settings(key, value)
values ('require_activation', '{"value":false}'::jsonb)
on conflict (key) do nothing;

insert into platform_settings(key, value)
values ('email_notifications_enabled', '{"value":true}'::jsonb)
on conflict (key) do nothing;

-- ============================================================================
-- Done. Verify with:
--   select entity_code, legal_entity_name, kyc_status from entities order by created_at;
-- ============================================================================
