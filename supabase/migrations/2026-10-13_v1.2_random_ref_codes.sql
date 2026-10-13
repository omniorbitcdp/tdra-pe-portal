-- ============================================================================
-- MIGRATION v1.2  —  Random reference codes, one length per type
--
--     PE   (Principal Entity) : PE-   + 8 random digits   e.g. PE-48291376
--     HDR  (Header)           : HDR-  + 6 random digits   e.g. HDR-731044
--     TPL  (Template)         : TPL-  + 7 random digits   e.g. TPL-2098841
--     URL  (URL)              : URL-  + 5 random digits   e.g. URL-55612
--
-- Self-contained and idempotent. Works whether your database still has the old
-- sequential codes (v1.1) or already has v1.2 six-digit codes — every existing
-- code is re-drawn at the correct length.
-- Run in Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- 1. Allocator ---------------------------------------------------------------
--    Random N-digit code, retried until unused. A transaction-scoped advisory
--    lock serialises allocation per table, so two concurrent inserts can never
--    be handed the same code.
drop function if exists allocate_ref_code(text, text, text);

create or replace function allocate_ref_code(p_prefix text, p_table text, p_column text, p_digits int)
returns text language plpgsql as $$
declare
  n        bigint;
  lo       bigint;
  span     bigint;
  code     text;
  taken    boolean;
  attempts int := 0;
begin
  if p_digits < 4 or p_digits > 9 then
    raise exception 'p_digits must be between 4 and 9 (got %)', p_digits;
  end if;

  perform pg_advisory_xact_lock(hashtext('refcode:' || p_table));

  lo   := (10 ^ (p_digits - 1))::bigint;          -- 5 digits -> 10000
  span := 9 * lo;                                  -- 5 digits -> 90000 values

  loop
    attempts := attempts + 1;
    n    := lo + floor(random() * span)::bigint;   -- always exactly p_digits long
    code := p_prefix || '-' || n::text;
    execute format('select exists(select 1 from %I where %I = $1)', p_table, p_column)
      into taken using code;
    exit when not taken;
    if attempts >= 100 then
      raise exception 'Could not allocate a unique % reference code after % attempts', p_prefix, attempts;
    end if;
  end loop;

  return code;
end; $$;

-- 2. Trigger — one digit length per module -----------------------------------
create or replace function assign_ref_code()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'entities' then
    if new.entity_code is null then
      new.entity_code := allocate_ref_code('PE', 'entities', 'entity_code', 8);
    end if;
  elsif tg_table_name = 'header_registrations' then
    if new.header_code is null then
      new.header_code := allocate_ref_code('HDR', 'header_registrations', 'header_code', 6);
    end if;
  elsif tg_table_name = 'template_registrations' then
    if new.template_code is null then
      new.template_code := allocate_ref_code('TPL', 'template_registrations', 'template_code', 7);
    end if;
  elsif tg_table_name = 'url_registrations' then
    if new.url_code is null then
      new.url_code := allocate_ref_code('URL', 'url_registrations', 'url_code', 5);
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

-- 3. Re-draw every existing code at the new length ---------------------------
--    Codes are nulled first: the unique indexes are partial ("where col is not
--    null"), so the intermediate state is legal.
update entities               set entity_code   = null where entity_code   is not null;
update header_registrations   set header_code   = null where header_code   is not null;
update template_registrations set template_code = null where template_code is not null;
update url_registrations      set url_code      = null where url_code      is not null;

do $$
declare r record;
begin
  for r in select id from entities order by created_at loop
    update entities set entity_code = allocate_ref_code('PE', 'entities', 'entity_code', 8) where id = r.id;
  end loop;
  for r in select id from header_registrations order by created_at loop
    update header_registrations set header_code = allocate_ref_code('HDR', 'header_registrations', 'header_code', 6) where id = r.id;
  end loop;
  for r in select id from template_registrations order by created_at loop
    update template_registrations set template_code = allocate_ref_code('TPL', 'template_registrations', 'template_code', 7) where id = r.id;
  end loop;
  for r in select id from url_registrations order by created_at loop
    update url_registrations set url_code = allocate_ref_code('URL', 'url_registrations', 'url_code', 5) where id = r.id;
  end loop;
end $$;

-- 4. No counter sequences are used any more ----------------------------------
drop sequence if exists ref_entity_seq;
drop sequence if exists ref_header_seq;
drop sequence if exists ref_template_seq;
drop sequence if exists ref_url_seq;

-- 5. Uniqueness (defence in depth alongside the allocator's own check) --------
create unique index if not exists uq_entities_code on entities(entity_code)                 where entity_code  is not null;
create unique index if not exists uq_header_code   on header_registrations(header_code)     where header_code  is not null;
create unique index if not exists uq_template_code on template_registrations(template_code) where template_code is not null;
create unique index if not exists uq_url_code      on url_registrations(url_code)           where url_code     is not null;

-- ============================================================================
-- Verify — every row must have a code of exactly the right length:
--   select entity_code, legal_entity_name from entities order by created_at;
--   select count(*) filter (where entity_code   !~ '^PE-[0-9]{8}$')  as bad_pe   from entities;
--   select count(*) filter (where header_code   !~ '^HDR-[0-9]{6}$') as bad_hdr  from header_registrations;
--   select count(*) filter (where template_code !~ '^TPL-[0-9]{7}$') as bad_tpl  from template_registrations;
--   select count(*) filter (where url_code      !~ '^URL-[0-9]{5}$') as bad_url  from url_registrations;
--   All four "bad_*" counts must be 0.
-- ============================================================================
