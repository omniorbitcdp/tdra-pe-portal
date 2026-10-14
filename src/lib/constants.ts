// Central enumerations & labels. Kept as plain constants so both UI and API
// share one source of truth (requirements §2, §9, Appendix confirmations).

export const ROLES = ['PE', 'OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  PE: 'Enterprise',
  OPERATOR_KYC: 'Telecom Operator – KYC Approver',
  OPERATOR_HEADER: 'Telecom Operator – Header Approver',
  OPERATOR_TEMPLATE_URL: 'Telecom Operator – Template/URL Approver',
  ADMIN: 'Platform Administrator',
};

export const MODULES = ['KYC', 'HEADER', 'TEMPLATE', 'URL'] as const;
export type ModuleKey = (typeof MODULES)[number];

/** §9 Suggested status values for registration modules */
export const REG_STATUSES = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'RESUBMITTED', 'APPROVED', 'REJECTED',
] as const;
export type RegStatus = (typeof REG_STATUSES)[number];

export const REG_STATUS_LABELS: Record<RegStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  CLARIFICATION_REQUIRED: 'Clarification Required',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** §5 Individual KYC document statuses */
export const DOC_STATUSES = [
  'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'RESUBMISSION_REQUIRED',
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  PENDING_VERIFICATION: 'Pending Verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  RESUBMISSION_REQUIRED: 'Resubmission Required',
};

/** §5 & §12 – the four mandatory TDRA KYC document categories */
export const MANDATORY_DOC_TYPES = [
  'TRADE_LICENCE', 'EMIRATES_ID', 'SIGNATORY_LETTER', 'VAT_CERTIFICATE',
] as const;
export type DocType = (typeof MANDATORY_DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  TRADE_LICENCE: 'Trade Licence',
  EMIRATES_ID: 'Emirates ID of Signatory',
  SIGNATORY_LETTER: 'Authorised Signatory Letter',
  VAT_CERTIFICATE: 'VAT Certificate',
};

// Registration activates an account immediately — there is no PENDING_ACTIVATION state.
export const ACCOUNT_STATUSES = ['ACTIVE', 'LOCKED', 'DISABLED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const UAE_EMIRATES = [
  'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah',
] as const;

export const ENTITY_TYPES = [
  'Mainland company',
  'Free zone company',
  'Branch of a UAE or foreign company',
  'Sole establishment',
  'Other',
] as const;

export const INDUSTRIES = [
  'Telecommunications', 'Retail', 'Banking & Finance', 'Healthcare', 'Logistics & Transport',
  'E-commerce', 'Hospitality & Tourism', 'Education', 'Technology', 'Government', 'Other',
] as const;

export const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export type Channel = (typeof CHANNELS)[number];

/** §3 / §10 – notification-producing events */
export const NOTIFICATION_EVENTS = [
  'ACCOUNT_ACTIVATION', 'PASSWORD_RESET', 'OTP_VERIFY', 'KYC_SUBMITTED', 'KYC_APPROVED',
  'KYC_REJECTED', 'KYC_RESUBMISSION', 'HEADER_SUBMITTED', 'HEADER_APPROVED', 'HEADER_REJECTED',
  'TEMPLATE_SUBMITTED', 'TEMPLATE_APPROVED', 'TEMPLATE_REJECTED', 'URL_SUBMITTED',
  'URL_APPROVED', 'URL_REJECTED',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** File rules — the client asked for 5 MB; requirements appendix proposes 10 MB.
 *  Default = 5 MB (client instruction), absolute ceiling configurable up to 10 MB. */
export const DEFAULT_MAX_KYC_FILE_MB = 5;
export const ABSOLUTE_MAX_KYC_FILE_MB = 10;
export const KYC_ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'] as const;

export const SESSION_COOKIE = 'tdra_session';

/** Landing route per role. Kept here (not in lib/auth) so middleware can use it
 *  without importing anything that touches next/headers. */
export const HOME_FOR_ROLE: Record<Role, string> = {
  PE: '/pe',
  OPERATOR_KYC: '/operator',
  OPERATOR_HEADER: '/operator',
  OPERATOR_TEMPLATE_URL: '/operator',
  ADMIN: '/admin',
};

/** Which approval queue a role owns. Drives role-scoped navigation & summaries. */
export const MODULES_FOR_ROLE: Record<Role, ModuleKey[]> = {
  PE: [],
  OPERATOR_KYC: ['KYC'],
  OPERATOR_HEADER: ['HEADER'],
  OPERATOR_TEMPLATE_URL: ['TEMPLATE', 'URL'],
  ADMIN: ['KYC', 'HEADER', 'TEMPLATE', 'URL'],
};
