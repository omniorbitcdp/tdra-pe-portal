// One label table for every status the database can store, so a raw value like
// `UNDER_REVIEW` never reaches the screen untranslated.
import { REG_STATUS_LABELS, DOC_STATUS_LABELS } from './constants';
import { GRIEVANCE_STATUS_LABELS } from './grievance';

export const STATUS_LABELS: Record<string, string> = {
  ...REG_STATUS_LABELS,
  ...DOC_STATUS_LABELS,
  ...GRIEVANCE_STATUS_LABELS,
  VERIFIED: 'Verified',
  ACTIVE: 'Active',
  LOCKED: 'Locked',
  DISABLED: 'Disabled',
  PENDING_ACTIVATION: 'Pending activation',
  NOT_STARTED: 'Not started',
  SENT: 'Sent',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

/** Values stored verbatim in the database that are shown as text. */
export const DATA_LABELS = {
  entityType: ['Mainland company', 'Free zone company', 'Branch of a UAE or foreign company',
    'Sole establishment', 'Other'],
  industry: ['Telecommunications', 'Retail', 'Banking & Finance', 'Healthcare', 'Logistics & Transport',
    'E-commerce', 'Hospitality & Tourism', 'Education', 'Technology', 'Government', 'Other'],
  emirate: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
  channel: ['EMAIL', 'SMS', 'WHATSAPP'],
  module: ['KYC', 'DOCUMENT', 'HEADER', 'TEMPLATE', 'URL', 'ACCOUNT', 'AUTH', 'ADMIN', 'API_CONFIG'],
  templateCategory: ['Transactional', 'OTP', 'Promotional', 'Service'],
  role: ['PE', 'OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN'],
} as const;

/** Does this string need translating as a data value? */
export function isDataValue(value: string): boolean {
  return Object.values(DATA_LABELS).some((list) => (list as readonly string[]).includes(value));
}
