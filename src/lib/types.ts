// Row shapes for the tables used across the app (kept in sync with schema.sql).
import type { AccountStatus, Channel, DocStatus, DocType, RegStatus, Role } from './constants';

export interface AppUser {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  entity_id: string | null;
  status: AccountStatus;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  password_changed_at: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  legal_entity_name: string;
  entity_type: string;
  trade_licence_number: string | null;
  trade_licence_authority: string | null;
  vat_trn: string | null;
  company_reg_no: string | null;
  registered_address: string;
  country: string;
  emirate: string | null;
  city: string | null;
  postal_code: string | null;
  website: string | null;
  industry: string | null;
  business_description: string | null;
  signatory_name: string | null;
  signatory_designation: string | null;
  official_email: string | null;
  mobile: string | null;
  alt_contact: string | null;
  kyc_status: RegStatus;
  kyc_info_approved: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KycDocument {
  id: string;
  entity_id: string;
  doc_type: DocType;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: DocStatus;
  remarks: string | null;
  version: number;
  uploaded_by: string | null;
  uploaded_at: string;
  verified_by: string | null;
  verified_at: string | null;
  updated_at: string;
}

export interface HeaderRegistration {
  id: string;
  entity_id: string;
  header_name: string;
  sender_id: string;
  header_type: string;
  ussd: string | null;
  status: RegStatus;
  remarks: string | null;
  created_by: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateRegistration {
  id: string;
  entity_id: string;
  header_id: string;
  template_name: string;
  category: string;
  channel: string;
  dlt_template_id: string | null;
  body: string;
  variables: string | null;
  status: RegStatus;
  remarks: string | null;
  created_by: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UrlRegistration {
  id: string;
  entity_id: string;
  template_id: string;
  url: string;
  method: string;
  callback_type: string;
  status: RegStatus;
  remarks: string | null;
  created_by: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiProvider {
  id: string;
  channel: Channel;
  provider_name: string;
  base_url: string;
  http_method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  query_params: Record<string, string>;
  body_template: string | null;
  auth_type: 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY';
  auth_config: Record<string, string>;
  timeout_ms: number;
  is_active: boolean;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id?: number;
  entity_id: string | null;
  module: string;
  record_id: string | null;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  from_status: string | null;
  to_status: string | null;
  remarks: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
}
