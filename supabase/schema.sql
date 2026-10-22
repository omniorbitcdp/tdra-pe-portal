-- ============================================================================
-- TDRA Pack – Principal Entity (PE) Portal  |  Supabase / PostgreSQL schema
-- Version 1.0
-- Run this in Supabase SQL Editor (or `supabase db push`) BEFORE seed.sql
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 0. Shared helper: gen_random_uuid() is provided by pgcrypto.
--    Status values are plain TEXT + CHECK constraints so the list stays
--    configurable without enum migrations.
-- ---------------------------------------------------------------------------

-- used to auto-maintain updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ===========================================================================
-- 1. PLATFORM SETTINGS  (branding: operator name + logo; editable anytime)
-- ===========================================================================
create table if not exists platform_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ===========================================================================
-- 2. APP USERS  ("simple login table" – email + password hash + role)
--    NOTE: communication channels (email/SMS/WhatsApp) are NEVER the
--    account store; this table is the single system of record.
-- ===========================================================================
create table if not exists app_users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null unique,
  password_hash         text not null,                    -- bcrypt, never plain text
  full_name             text,
  phone                 text,
  role                  text not null check (role in (
                          'PE','OPERATOR_KYC','OPERATOR_HEADER','OPERATOR_TEMPLATE_URL','ADMIN')),
  entity_id             uuid,                             -- set for PE users only
  -- Account status. Registration activates the account immediately (email +
  -- password is sufficient — there is no email-activation step).
  status                text not null default 'ACTIVE'
                          check (status in ('ACTIVE','LOCKED','DISABLED')),
  failed_login_attempts int  not null default 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  password_changed_at   timestamptz,
  must_change_password  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_app_users_role on app_users(role);
create index if not exists idx_app_users_entity on app_users(entity_id);
drop trigger if exists trg_app_users_updated on app_users;
create trigger trg_app_users_updated before update on app_users
  for each row execute function set_updated_at();

-- ===========================================================================
-- 3. ENTITIES  (PE registration form §4.1 + §4.2)
-- ===========================================================================
create table if not exists entities (
  id                     uuid primary key default gen_random_uuid(),
  -- §4.1 Entity and business details
  legal_entity_name      text not null,
  entity_type            text not null,   -- Mainland / Free zone / Branch / Sole establishment / Other
  trade_licence_number   text,
  trade_licence_authority text,
  vat_trn                text,
  company_reg_no         text,
  registered_address     text not null,
  country                text not null default 'United Arab Emirates',
  emirate                text,            -- UAE emirate (7 options)
  city                   text,
  postal_code            text,
  website                text,
  industry               text,
  business_description   text,
  -- §4.2 Authorised signatory / contact details
  signatory_name         text,
  signatory_designation  text,
  official_email         text,
  mobile                 text,
  alt_contact            text,
  -- workflow
  kyc_status             text not null default 'DRAFT' check (kyc_status in (
                           'DRAFT','SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED',
                           'RESUBMITTED','APPROVED','REJECTED')),
  kyc_info_approved      boolean not null default false,
  created_by             uuid references app_users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_entities_status on entities(kyc_status);
drop trigger if exists trg_entities_updated on entities;
create trigger trg_entities_updated before update on entities
  for each row execute function set_updated_at();

-- ===========================================================================
-- 4. KYC DOCUMENTS  (§5 – four mandatory TDRA documents, each verified
--    independently by the KYC Approver)
-- ===========================================================================
create table if not exists kyc_documents (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete cascade,
  doc_type       text not null check (doc_type in (
                   'TRADE_LICENCE','EMIRATES_ID','SIGNATORY_LETTER','VAT_CERTIFICATE')),
  file_name      text not null,
  storage_path   text not null,          -- path in Supabase Storage bucket
  mime_type      text not null,
  size_bytes     bigint not null,
  status         text not null default 'PENDING_VERIFICATION' check (status in (
                   'PENDING_VERIFICATION','VERIFIED','REJECTED','RESUBMISSION_REQUIRED')),
  remarks        text,
  version        int not null default 1,
  uploaded_by    uuid references app_users(id) on delete set null,
  uploaded_at    timestamptz not null default now(),
  verified_by    uuid references app_users(id) on delete set null,
  verified_at    timestamptz,
  updated_at     timestamptz not null default now(),
  unique (entity_id, doc_type)            -- one current doc per type (replace = new version)
);
create index if not exists idx_kyc_entity on kyc_documents(entity_id);
drop trigger if exists trg_kyc_updated on kyc_documents;
create trigger trg_kyc_updated before update on kyc_documents
  for each row execute function set_updated_at();

-- ===========================================================================
-- 5. HEADER REGISTRATIONS   (step 4 in §6 workflow)
-- ===========================================================================
create table if not exists header_registrations (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references entities(id) on delete cascade,
  header_name   text not null,            -- sender/mask name
  sender_id     text not null,            -- e.g. "TDRA" or alphanumeric mask
  header_type   text not null default 'ALPHANUMERIC'
                  check (header_type in ('ALPHANUMERIC','NUMERIC','SHORTCODE')),
  ussd          text,
  status        text not null default 'DRAFT' check (status in (
                  'DRAFT','SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED',
                  'RESUBMITTED','APPROVED','REJECTED')),
  remarks       text,
  created_by    uuid references app_users(id) on delete set null,
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decided_by    uuid references app_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_header_entity on header_registrations(entity_id);
create index if not exists idx_header_status on header_registrations(status);
drop trigger if exists trg_header_updated on header_registrations;
create trigger trg_header_updated before update on header_registrations
  for each row execute function set_updated_at();

-- ===========================================================================
-- 6. TEMPLATE REGISTRATIONS   (step 6 – must reference an APPROVED header)
-- ===========================================================================
create table if not exists template_registrations (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references entities(id) on delete cascade,
  header_id     uuid not null references header_registrations(id) on delete restrict,
  template_name text not null,
  category      text not null default 'TRANSACTIONAL',   -- TRANSACTIONAL / OTP / PROMOTIONAL / SERVICE
  channel       text not null default 'SMS' check (channel = 'SMS'),   -- SMS templates only
  dlt_template_id text,
  body          text not null,
  variables     text,                    -- comma list of declared <varN> tokens
  variable_samples jsonb not null default '{}'::jsonb,   -- { "var1": "sample content" }
  status        text not null default 'DRAFT' check (status in (
                  'DRAFT','SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED',
                  'RESUBMITTED','APPROVED','REJECTED')),
  remarks       text,
  created_by    uuid references app_users(id) on delete set null,
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decided_by    uuid references app_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_template_entity on template_registrations(entity_id);
create index if not exists idx_template_header on template_registrations(header_id);
create index if not exists idx_template_status on template_registrations(status);
drop trigger if exists trg_template_updated on template_registrations;
create trigger trg_template_updated before update on template_registrations
  for each row execute function set_updated_at();

-- ===========================================================================
-- 7. URL REGISTRATIONS   (step 8 – must reference an APPROVED template)
-- ===========================================================================
create table if not exists url_registrations (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references entities(id) on delete cascade,
  template_id   uuid references template_registrations(id) on delete restrict,  -- null = independent URL
  url           text not null,
  method        text not null default 'GET' check (method in ('GET','POST')),
  callback_type text not null default 'DLT' check (callback_type in ('DLT','SMS','WHATSAPP')),
  status        text not null default 'DRAFT' check (status in (
                  'DRAFT','SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED',
                  'RESUBMITTED','APPROVED','REJECTED')),
  remarks       text,
  created_by    uuid references app_users(id) on delete set null,
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decided_by    uuid references app_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_url_entity on url_registrations(entity_id);
create index if not exists idx_url_template on url_registrations(template_id);
create index if not exists idx_url_status on url_registrations(status);
drop trigger if exists trg_url_updated on url_registrations;
create trigger trg_url_updated before update on url_registrations
  for each row execute function set_updated_at();

-- ===========================================================================
-- 8. WORKFLOW SEQUENCE ENFORCEMENT (defence-in-depth at the DB layer)
--    Application APIs enforce this too (§6, §12). These triggers guarantee
--    it even if a client writes directly.
-- ===========================================================================
create or replace function enforce_sequence()
returns trigger language plpgsql as $$
declare
  hdr_status text;
  tpl_status text;
begin
  if tg_table_name = 'template_registrations' then
    select status into hdr_status from header_registrations where id = new.header_id;
    if hdr_status is distinct from 'APPROVED' then
      raise exception 'SEQUENCE_VIOLATION: template requires an APPROVED header (header status=%)', coalesce(hdr_status,'missing');
    end if;
  elsif tg_table_name = 'url_registrations' then
    select status into tpl_status from template_registrations where id = new.template_id;
    if tpl_status is distinct from 'APPROVED' then
      raise exception 'SEQUENCE_VIOLATION: URL requires an APPROVED template (template status=%)', coalesce(tpl_status,'missing');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_template_sequence on template_registrations;
create trigger trg_template_sequence before insert or update on template_registrations
  for each row execute function enforce_sequence();

drop trigger if exists trg_url_sequence on url_registrations;
create trigger trg_url_sequence before insert or update on url_registrations
  for each row execute function enforce_sequence();

-- ===========================================================================
-- 9. AUDIT TRAIL  (§7.1, §11 – reviewer identity, action, timestamp, remarks,
--    previous/new status)
-- ===========================================================================
create table if not exists audit_log (
  id             bigint generated always as identity primary key,
  entity_id      uuid,
  module         text not null,           -- ACCOUNT, KYC, DOCUMENT, HEADER, TEMPLATE, URL, ADMIN, API_CONFIG, AUTH
  record_id      uuid,
  action         text not null,           -- CREATE, SUBMIT, APPROVE, REJECT, RESUBMIT, UPDATE, LOGIN, LOGOUT, VERIFY_DOCUMENT ...
  actor_id       uuid,
  actor_email    text,
  actor_role     text,
  from_status    text,
  to_status      text,
  remarks        text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_audit_module on audit_log(module);
create index if not exists idx_audit_record on audit_log(record_id);
create index if not exists idx_audit_entity on audit_log(entity_id);

-- ===========================================================================
-- 10. NOTIFICATION LOG  (§10 – event, channel, recipient, provider msg id,
--     delivery result)
-- ===========================================================================
create table if not exists notifications_log (
  id                  bigint generated always as identity primary key,
  event               text not null,
  channel             text not null check (channel in ('EMAIL','SMS','WHATSAPP')),
  recipient           text not null,
  provider_id         uuid,
  provider_message_id text,
  status              text not null default 'QUEUED' check (status in ('QUEUED','SENT','FAILED','SKIPPED')),
  http_status         int,
  error               text,
  payload             jsonb not null default '{}'::jsonb,
  response            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists idx_notif_event on notifications_log(event);

-- ===========================================================================
-- 11. API PROVIDERS  (Postman/RapidAPI-style configurable gateway for
--     Email / SMS / WhatsApp). Credentials stored as jsonb; production should
--     move secrets to env / vault — noted in README.
-- ===========================================================================
create table if not exists api_providers (
  id             uuid primary key default gen_random_uuid(),
  channel        text not null check (channel in ('EMAIL','SMS','WHATSAPP')),
  provider_name  text not null,
  base_url       text not null,
  http_method    text not null default 'POST' check (http_method in ('GET','POST','PUT','PATCH')),
  headers        jsonb not null default '{}'::jsonb,      -- {"Content-Type":"application/json"}
  query_params   jsonb not null default '{}'::jsonb,
  body_template  text,                                    -- supports {{placeholders}}
  auth_type      text not null default 'NONE' check (auth_type in ('NONE','BEARER','BASIC','API_KEY')),
  auth_config    jsonb not null default '{}'::jsonb,      -- {token} | {username,password} | {key_name,key_value,key_in}
  timeout_ms     int not null default 15000,
  is_active      boolean not null default true,
  is_default     boolean not null default false,          -- active provider used by notify service
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_provider_channel on api_providers(channel);
drop trigger if exists trg_provider_updated on api_providers;
create trigger trg_provider_updated before update on api_providers
  for each row execute function set_updated_at();

-- ===========================================================================
-- 12. PASSWORD-RESET / VERIFY TOKENS  (time-limited links & OTPs — §3, never
--     send plain-text passwords; not used for signup activation)
-- ===========================================================================
create table if not exists auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  purpose     text not null check (purpose in ('PASSWORD_RESET','OTP_VERIFY')),
  token_hash  text not null,             -- sha256 of the token (raw token only sent to user)
  otp_code    text,                      -- short numeric code (hashed compare optional)
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tokens_user on auth_tokens(user_id);

-- ===========================================================================
-- 13. Row Level Security
--     The app talks to Postgres with the SERVICE ROLE key from server-side
--     API routes only (never from the browser) and enforces RBAC in code.
--     RLS is enabled with a deny-all default so the anon/public key cannot
--     read or write anything even if leaked.
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'app_users','entities','kyc_documents','header_registrations',
    'template_registrations','url_registrations','audit_log',
    'notifications_log','api_providers','auth_tokens','platform_settings'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists no_anon_access on %I;', t);
    execute format($f$create policy no_anon_access on %I for all to anon, authenticated using (false) with check (false);$f$, t);
  end loop;
end $$;

-- ===========================================================================
-- 14. Storage bucket for KYC documents (private; 10 MB limit; PDF/JPEG/PNG)
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents','kyc-documents', false, 10485760,
        array['application/pdf','image/jpeg','image/jpg','image/png'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ===========================================================================
-- 15. REFERENCE CODES (v1.2) — random reference IDs, one length per module
--       PE  : PE-   + 8 random digits
--       HDR : HDR-  + 6 random digits
--       TPL : TPL-  + 7 random digits
--       URL : URL-  + 5 random digits
--     Allocated by trigger with a transaction-scoped advisory lock.
-- ===========================================================================

create or replace function allocate_ref_code(p_prefix text, p_table text, p_column text, p_digits int)
returns text language plpgsql as $$
declare
  n bigint; lo bigint; span bigint; code text; taken boolean; attempts int := 0;
begin
  if p_digits < 4 or p_digits > 9 then
    raise exception 'p_digits must be between 4 and 9 (got %)', p_digits;
  end if;
  perform pg_advisory_xact_lock(hashtext('refcode:' || p_table));
  lo   := (10 ^ (p_digits - 1))::bigint;
  span := 9 * lo;
  loop
    attempts := attempts + 1;
    n    := lo + floor(random() * span)::bigint;
    code := p_prefix || '-' || n::text;
    execute format('select exists(select 1 from %I where %I = $1)', p_table, p_column) into taken using code;
    exit when not taken;
    if attempts >= 100 then
      raise exception 'Could not allocate a unique % reference code after % attempts', p_prefix, attempts;
    end if;
  end loop;
  return code;
end; $$;

create or replace function assign_ref_code()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'entities' then
    if new.entity_code is null then new.entity_code := allocate_ref_code('PE', 'entities', 'entity_code', 8); end if;
  elsif tg_table_name = 'header_registrations' then
    if new.header_code is null then new.header_code := allocate_ref_code('HDR', 'header_registrations', 'header_code', 6); end if;
  elsif tg_table_name = 'template_registrations' then
    if new.template_code is null then new.template_code := allocate_ref_code('TPL', 'template_registrations', 'template_code', 7); end if;
  elsif tg_table_name = 'url_registrations' then
    if new.url_code is null then new.url_code := allocate_ref_code('URL', 'url_registrations', 'url_code', 5); end if;
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

create unique index if not exists uq_entities_code on entities(entity_code)                 where entity_code  is not null;
create unique index if not exists uq_header_code   on header_registrations(header_code)     where header_code  is not null;
create unique index if not exists uq_template_code on template_registrations(template_code) where template_code is not null;
create unique index if not exists uq_url_code      on url_registrations(url_code)           where url_code     is not null;

-- Performance indexes
create index if not exists idx_entity_status_created   on entities(kyc_status, created_at desc);
create index if not exists idx_audit_entity_created    on audit_log(entity_id, created_at desc);
create index if not exists idx_audit_created           on audit_log(created_at desc);
create index if not exists idx_header_status_created   on header_registrations(status, created_at desc);
create index if not exists idx_template_status_created on template_registrations(status, created_at desc);
create index if not exists idx_url_status_created      on url_registrations(status, created_at desc);
create index if not exists idx_notif_created           on notifications_log(created_at desc);
create index if not exists idx_notif_channel           on notifications_log(channel, created_at desc);
create index if not exists idx_kycdoc_status           on kyc_documents(entity_id, status);

-- ===========================================================================
-- Done.
-- ===========================================================================
