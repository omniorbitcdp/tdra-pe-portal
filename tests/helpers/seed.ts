import type { Tables } from './mockDb';

export const PE_A_ENTITY = 'ent-aaaa-1111';
export const PE_B_ENTITY = 'ent-bbbb-2222';

export const IDS = {
  peAUser: 'u-pe-a', peBUser: 'u-pe-b', kyc: 'u-kyc', header: 'u-hdr', tpl: 'u-tpl', admin: 'u-admin',
  headerA: '11111111-1111-4111-8111-111111111111', headerB: '22222222-2222-4222-8222-222222222222', tplA: '33333333-3333-4333-8333-333333333333', urlA: '44444444-4444-4444-8444-444444444444',
  docA: 'doc-a-1', docB: 'doc-b-1',
};

export function seed(): Tables {
  return {
    app_users: [
      { id: IDS.peAUser, email: 'pe-a@x.ae', password_hash: 'x', full_name: 'PE Alpha', role: 'PE', entity_id: PE_A_ENTITY, status: 'ACTIVE', failed_login_attempts: 0 },
      { id: IDS.peBUser, email: 'pe-b@x.ae', password_hash: 'x', full_name: 'PE Bravo', role: 'PE', entity_id: PE_B_ENTITY, status: 'ACTIVE', failed_login_attempts: 0 },
      { id: IDS.kyc, email: 'kyc@op.demo', password_hash: 'x', full_name: 'KYC Reviewer', role: 'OPERATOR_KYC', entity_id: null, status: 'ACTIVE' },
      { id: IDS.header, email: 'hdr@op.demo', password_hash: 'x', full_name: 'Header Reviewer', role: 'OPERATOR_HEADER', entity_id: null, status: 'ACTIVE' },
      { id: IDS.tpl, email: 'tpl@op.demo', password_hash: 'x', full_name: 'Template Reviewer', role: 'OPERATOR_TEMPLATE_URL', entity_id: null, status: 'ACTIVE' },
      { id: IDS.admin, email: 'admin@x.demo', password_hash: 'x', full_name: 'Platform Admin', role: 'ADMIN', entity_id: null, status: 'ACTIVE' },
    ],
    entities: [
      { id: PE_A_ENTITY, entity_code: 'PE-11111111', legal_entity_name: 'Alpha Telecom', entity_type: 'Free zone company', kyc_status: 'APPROVED', kyc_info_approved: true, created_by: IDS.peAUser, created_at: '2026-01-01T00:00:00Z', official_email: 'pe-a@x.ae' },
      { id: PE_B_ENTITY, entity_code: 'PE-22222222', legal_entity_name: 'Bravo Retail', entity_type: 'Mainland company', kyc_status: 'SUBMITTED', kyc_info_approved: false, created_by: IDS.peBUser, created_at: '2026-01-02T00:00:00Z', official_email: 'pe-b@x.ae' },
    ],
    kyc_documents: [
      { id: IDS.docA, entity_id: PE_A_ENTITY, doc_type: 'TRADE_LICENCE', file_name: 'a.pdf', storage_path: `${PE_A_ENTITY}/TRADE_LICENCE/a.pdf`, mime_type: 'application/pdf', size_bytes: 10, status: 'VERIFIED' },
      { id: IDS.docB, entity_id: PE_B_ENTITY, doc_type: 'TRADE_LICENCE', file_name: 'b.pdf', storage_path: `${PE_B_ENTITY}/TRADE_LICENCE/b.pdf`, mime_type: 'application/pdf', size_bytes: 10, status: 'PENDING_VERIFICATION' },
    ],
    header_registrations: [
      { id: IDS.headerA, header_code: 'HDR-111111', entity_id: PE_A_ENTITY, header_name: 'Alpha Alerts', sender_id: 'ALPHA', status: 'APPROVED', created_by: IDS.peAUser, created_at: '2026-01-03T00:00:00Z' },
      { id: IDS.headerB, header_code: 'HDR-222222', entity_id: PE_B_ENTITY, header_name: 'Bravo Alerts', sender_id: 'BRAVO', status: 'SUBMITTED', created_by: IDS.peBUser, created_at: '2026-01-04T00:00:00Z' },
    ],
    template_registrations: [
      { id: IDS.tplA, template_code: 'TPL-1111111', entity_id: PE_A_ENTITY, header_id: IDS.headerA, template_name: 'Alpha OTP', category: 'OTP', channel: 'SMS', body: 'Dear <var1>, your order <var2> is ready.', variables: 'var1,var2', variable_samples: { var1: 'Puneet', var2: 'ORD-44712' }, status: 'APPROVED', created_by: IDS.peAUser, created_at: '2026-01-05T00:00:00Z' },
    ],
    url_registrations: [
      { id: IDS.urlA, url_code: 'URL-11111', entity_id: PE_A_ENTITY, template_id: IDS.tplA, url: 'https://alpha.ae/cb', method: 'POST', callback_type: 'DLT', status: 'APPROVED', created_by: IDS.peAUser, created_at: '2026-01-06T00:00:00Z' },
    ],
    audit_log: [
      { id: 1, entity_id: PE_A_ENTITY, module: 'KYC', action: 'APPROVE', actor_id: IDS.kyc, actor_name: 'KYC Reviewer', actor_email: 'kyc@op.demo', actor_role: 'OPERATOR_KYC', remarks: 'ok', created_at: '2026-01-07T00:00:00Z' },
      { id: 2, entity_id: PE_B_ENTITY, module: 'KYC', action: 'SUBMIT', actor_id: IDS.peBUser, actor_name: 'PE Bravo', actor_email: 'pe-b@x.ae', actor_role: 'PE', remarks: 'submitted', created_at: '2026-01-08T00:00:00Z' },
    ],
    notifications_log: [],
    api_providers: [
      { id: 'prov-1', channel: 'EMAIL', provider_name: 'Email', base_url: 'https://e.test/send', http_method: 'POST', headers: {}, query_params: {}, body_template: '{}', auth_type: 'BEARER', auth_config: { token: 'sk_secret' }, timeout_ms: 5000, is_active: true, is_default: true },
    ],
    auth_tokens: [],
    platform_settings: [
      { key: 'operator_name', value: { value: 'Test Operator' } },
      { key: 'operator_short_name', value: { value: 'TO' } },
      { key: 'brand_color', value: { value: '#345dff' } },
      { key: 'max_kyc_file_mb', value: { value: 5 } },
    ],
  };
}
