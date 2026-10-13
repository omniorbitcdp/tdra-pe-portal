-- ============================================================================
-- TDRA PE Portal – SEED DATA  (run AFTER schema.sql)
-- Idempotent: safe to re-run. Uses pgcrypto crypt() for bcrypt password hashes.
--
-- DEMO LOGINS (password in brackets) — change in production:
--   admin@tdra.demo            [Admin@12345]      Platform Administrator
--   kyc.approver@operator.demo [Approver@123]     KYC Approver
--   header.approver@operator.demo [Approver@123]  Header Approver
--   tpl.approver@operator.demo [Approver@123]     Template/URL Approver
--   pe.demo@acme.ae            [PE@12345]         PE user (Acme Telecom FZ-LLC)
--   pe.demo@falcon.ae          [PE@12345]         PE user (Falcon Retail LLC)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Platform settings / branding (editable from the admin screen)
-- ---------------------------------------------------------------------------
insert into platform_settings(key, value) values
  ('operator_name', '{"value":"e& UAE (Etisalat)"}'::jsonb),
  ('operator_short_name', '{"value":"e&"}'::jsonb),
  ('logo_data_url', '{"value":null}'::jsonb),           -- set a base64 data URL or image URL
  ('brand_color', '{"value":"#345dff"}'::jsonb),
  ('max_kyc_file_mb', '{"value":5}'::jsonb),
  ('allowed_kyc_mime', '{"value":["application/pdf","image/jpeg","image/jpg","image/png"]}'::jsonb),
  ('email_notifications_enabled', '{"value":true}'::jsonb),
  ('retention_days', '{"value":{"pe_profile":2555,"kyc_documents":2555,"audit_log":2555,"notification_log":365}}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Users (simple login table: email + bcrypt hash + role)
-- ---------------------------------------------------------------------------
insert into app_users (id, email, password_hash, full_name, phone, role, entity_id, status, password_changed_at) values
  ('11111111-1111-1111-1111-111111111111','admin@tdra.demo',          crypt('Admin@12345', gen_salt('bf',10)),'Platform Admin',      '+971500000001','ADMIN',                 null, 'ACTIVE', now()),
  ('22222222-2222-2222-2222-222222222222','kyc.approver@operator.demo', crypt('Approver@123', gen_salt('bf',10)),'Aisha KYC Approver',  '+971500000002','OPERATOR_KYC',          null, 'ACTIVE', now()),
  ('33333333-3333-3333-3333-333333333333','header.approver@operator.demo', crypt('Approver@123', gen_salt('bf',10)),'Omar Header Approver','+971500000003','OPERATOR_HEADER',       null, 'ACTIVE', now()),
  ('44444444-4444-4444-4444-444444444444','tpl.approver@operator.demo', crypt('Approver@123', gen_salt('bf',10)),'Sara Template Approver','+971500000004','OPERATOR_TEMPLATE_URL', null, 'ACTIVE', now()),
  ('55555555-5555-5555-5555-555555555555','pe.demo@acme.ae',          crypt('PE@12345', gen_salt('bf',10)),'Rajesh Menon',        '+971500000005','PE',                    'aaaaaaaa-0000-0000-0000-000000000001','ACTIVE', now()),
  ('66666666-6666-6666-6666-666666666666','pe.demo@falcon.ae',        crypt('PE@12345', gen_salt('bf',10)),'Mariam Al Suwaidi',   '+971500000006','PE',                    'aaaaaaaa-0000-0000-0000-000000000002','ACTIVE', now())
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Entities (PE registration form)
-- ---------------------------------------------------------------------------
insert into entities (
  id, legal_entity_name, entity_type, trade_licence_number, trade_licence_authority,
  vat_trn, company_reg_no, registered_address, country, emirate, city, postal_code,
  website, industry, business_description,
  signatory_name, signatory_designation, official_email, mobile, alt_contact,
  kyc_status, kyc_info_approved, created_by
) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Acme Telecom FZ-LLC','Free zone company','DED-9938271','Dubai DED',
   '100123456700003','FZ-88213','Office 1402, Boulevard Plaza Tower 1, Downtown Dubai','United Arab Emirates','Dubai','Dubai','00000',
   'https://acme-telecom.ae','Telecommunications','Enterprise SMS, WhatsApp and OTP messaging for UAE businesses.',
   'Rajesh Menon','Managing Director','pe.demo@acme.ae','+971500000005','+97142220001',
   'APPROVED', true, '55555555-5555-5555-5555-555555555555'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Falcon Retail LLC','Mainland company','CN-4471209','Abu Dhabi DED',
   '100987654300003','CN-77120','Office 505, Capital Centre, Al Maryah Island','United Arab Emirates','Abu Dhabi','Abu Dhabi','00000',
   'https://falconretail.ae','Retail','Multi-brand retail chain sending order and delivery notifications.',
   'Mariam Al Suwaidi','Operations Director','pe.demo@falcon.ae','+971500000006',null,
   'UNDER_REVIEW', false, '66666666-6666-6666-6666-666666666666')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- KYC documents (four mandatory TDRA docs; statuses show mixed states)
-- ---------------------------------------------------------------------------
insert into kyc_documents (id, entity_id, doc_type, file_name, storage_path, mime_type, size_bytes, status, remarks, uploaded_by, verified_by, verified_at) values
  -- Acme (entity 1) – all verified (KYC APPROVED)
  ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','TRADE_LICENCE',   'acme-trade-licence.pdf','aaaaaaaa-0000-0000-0000-000000000001/TRADE_LICENCE.pdf','application/pdf',412000,'VERIFIED', null, '55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222', now() - interval '20 days'),
  ('eeeeeeee-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','EMIRATES_ID',     'acme-signatory-eid.pdf','aaaaaaaa-0000-0000-0000-000000000001/EMIRATES_ID.pdf','application/pdf',288000,'VERIFIED', null, '55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222', now() - interval '20 days'),
  ('eeeeeeee-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','SIGNATORY_LETTER','acme-signatory-letter.pdf','aaaaaaaa-0000-0000-0000-000000000001/SIGNATORY_LETTER.pdf','application/pdf',156000,'VERIFIED', null, '55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222', now() - interval '20 days'),
  ('eeeeeeee-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','VAT_CERTIFICATE', 'acme-vat-certificate.pdf','aaaaaaaa-0000-0000-0000-000000000001/VAT_CERTIFICATE.pdf','application/pdf',203000,'VERIFIED', null, '55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222', now() - interval '19 days'),
  -- Falcon (entity 2) – under review: one verified, one resubmission required, missing 2
  ('eeeeeeee-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000002','TRADE_LICENCE',   'falcon-trade-licence.pdf','aaaaaaaa-0000-0000-0000-000000000002/TRADE_LICENCE.pdf','application/pdf',501000,'VERIFIED', null, '66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222', now() - interval '3 days'),
  ('eeeeeeee-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000002','EMIRATES_ID',     'falcon-eid-blurry.jpg','aaaaaaaa-0000-0000-0000-000000000002/EMIRATES_ID.jpg','image/jpeg',2100000,'RESUBMISSION_REQUIRED','Emirates ID image is blurred; please re-upload a clear colour scan.', '66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222', now() - interval '2 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Header registrations
-- ---------------------------------------------------------------------------
insert into header_registrations (id, entity_id, header_name, sender_id, header_type, status, remarks, created_by, submitted_at, decided_at, decided_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Acme Alerts','ACME',   'ALPHANUMERIC','APPROVED',  'Approved. Sender ID is available.', '55555555-5555-5555-5555-555555555555', now() - interval '15 days', now() - interval '13 days','33333333-3333-3333-3333-333333333333'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Acme OTP',   'ACMOTP', 'ALPHANUMERIC','DRAFT',     null, '55555555-5555-5555-5555-555555555555', null, null, null),
  ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','Falcon Delivery','FALCON','ALPHANUMERIC','SUBMITTED','Please review.', '66666666-6666-6666-6666-666666666666', now() - interval '2 days', null, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Template registrations (must reference an APPROVED header)
-- ---------------------------------------------------------------------------
insert into template_registrations (id, entity_id, header_id, template_name, category, channel, dlt_template_id, body, variables, status, remarks, created_by, submitted_at, decided_at, decided_by) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Order Shipped','TRANSACTIONAL','SMS','DLT-ACME-1001','Dear {{name}}, your order {{order_id}} has shipped and will arrive by {{date}}. Track: {{link}}','name,order_id,date,link','APPROVED','Approved for transactional use.','55555555-5555-5555-5555-555555555555', now() - interval '12 days', now() - interval '10 days','44444444-4444-4444-4444-444444444444'),
  ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Login OTP','OTP','SMS','DLT-ACME-1002','{{otp}} is your Acme verification code. Valid for 5 minutes. Do not share.','otp','SUBMITTED','Awaiting review.','55555555-5555-5555-5555-555555555555', now() - interval '1 day', null, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- URL registrations (must reference an APPROVED template)
-- ---------------------------------------------------------------------------
insert into url_registrations (id, entity_id, template_id, url, method, callback_type, status, remarks, created_by, submitted_at, decided_at, decided_by) values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','https://acme-telecom.ae/dlt/order-status','POST','DLT','APPROVED','Callback URL verified.','55555555-5555-5555-5555-555555555555', now() - interval '9 days', now() - interval '8 days','44444444-4444-4444-4444-444444444444')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- API providers (Postman-style configurable gateways)
-- These are example shapes — edit them from /admin/api-config
-- ---------------------------------------------------------------------------
insert into api_providers (id, channel, provider_name, base_url, http_method, headers, query_params, body_template, auth_type, auth_config, is_active, is_default, created_by) values
  ('f0000001-0000-0000-0000-000000000001','EMAIL','Generic REST Email (SMTP2GO-style)','https://api.example-email.com/v3/send','POST',
   '{"Content-Type":"application/json"}'::jsonb,'{}'::jsonb,
   '{"sender":"no-reply@tdra.demo","to":"{{recipient}}","subject":"{{subject}}","html":"{{body}}"}',
   'API_KEY','{"key_name":"X-Api-Key","key_value":"REPLACE_WITH_EMAIL_API_KEY","key_in":"header"}'::jsonb, true, true, '11111111-1111-1111-1111-111111111111'),
  ('f0000002-0000-0000-0000-000000000002','SMS','Generic SMS Gateway','https://api.example-sms.com/v1/messages','POST',
   '{"Content-Type":"application/json"}'::jsonb,'{}'::jsonb,
   '{"sender_id":"{{sender_id}}","to":"{{recipient}}","message":"{{body}}"}',
   'BEARER','{"token":"REPLACE_WITH_SMS_TOKEN"}'::jsonb, true, true, '11111111-1111-1111-1111-111111111111'),
  ('f0000003-0000-0000-0000-000000000003','WHATSAPP','WhatsApp Business Cloud API','https://graph.facebook.com/v20.0/{{phone_number_id}}/messages','POST',
   '{"Content-Type":"application/json"}'::jsonb,'{}'::jsonb,
   '{"messaging_product":"whatsapp","to":"{{recipient}}","type":"text","text":{"body":"{{body}}"}}',
   'BEARER','{"token":"REPLACE_WITH_WHATSAPP_TOKEN"}'::jsonb, true, true, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A couple of audit rows so the history screens are not empty
-- ---------------------------------------------------------------------------
insert into audit_log (entity_id, module, record_id, action, actor_id, actor_email, actor_role, from_status, to_status, remarks) values
  ('aaaaaaaa-0000-0000-0000-000000000001','KYC','aaaaaaaa-0000-0000-0000-000000000001','APPROVE','22222222-2222-2222-2222-222222222222','kyc.approver@operator.demo','OPERATOR_KYC','UNDER_REVIEW','APPROVED','All four documents verified and entity details approved.'),
  ('aaaaaaaa-0000-0000-0000-000000000001','HEADER','bbbbbbbb-0000-0000-0000-000000000001','APPROVE','33333333-3333-3333-3333-333333333333','header.approver@operator.demo','OPERATOR_HEADER','SUBMITTED','APPROVED','Sender ID acceptable.')
on conflict do nothing;

-- ============================================================================
-- End of seed
-- ============================================================================
