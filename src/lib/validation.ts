// Input + file validation (requirements §4, appendix items 1-3).
import { z } from 'zod';
import { extractVariables } from './templateVars';
import {
  ENTITY_TYPES, KYC_ALLOWED_MIME, UAE_EMIRATES, DEFAULT_MAX_KYC_FILE_MB,
} from './constants';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const uaePhone = z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number with country code (e.g. +9715xxxxxxxx)');

export const registerSchema = z.object({
  email,
  password: z.string().min(10, 'Password must be at least 10 characters'),
  full_name: z.string().trim().min(2, 'Enter your full name'),
  phone: uaePhone,
});

export const loginSchema = z.object({
  // Which door the user is signing in through; validated against the account's role.
  portal: z.enum(['ENTERPRISE', 'TELCO']).optional(),
  email,
  password: z.string().min(1, 'Password is required'),
});

export const entityDetailsSchema = z.object({
  legal_entity_name: z.string().trim().min(2, 'Legal entity name is required'),
  entity_type: z.enum(ENTITY_TYPES as unknown as [string, ...string[]], {
    errorMap: () => ({ message: 'Select an entity type' }),
  }),
  trade_licence_number: z.string().trim().min(1, 'Trade licence number is required'),
  trade_licence_authority: z.string().trim().optional().or(z.literal('')),
  vat_trn: z.string().trim().regex(/^[0-9]{15}$/, 'UAE TRN must be 15 digits').optional().or(z.literal('')),
  company_reg_no: z.string().trim().optional().or(z.literal('')),
  registered_address: z.string().trim().min(5, 'Registered address is required'),
  country: z.string().trim().min(2).default('United Arab Emirates'),
  emirate: z.enum(UAE_EMIRATES as unknown as [string, ...string[]], {
    errorMap: () => ({ message: 'Select a UAE emirate' }),
  }),
  city: z.string().trim().min(2, 'City is required'),
  postal_code: z.string().trim().optional().or(z.literal('')),
  website: z.string().trim().url('Enter a valid URL').optional().or(z.literal('')),
  industry: z.string().trim().min(2, 'Industry/sector is required'),
  business_description: z.string().trim().min(10, 'Describe your business (min 10 characters)'),
  signatory_name: z.string().trim().min(2, 'Authorised signatory full name is required'),
  signatory_designation: z.string().trim().min(2, 'Designation is required'),
  official_email: email,
  mobile: uaePhone,
  alt_contact: z.string().trim().optional().or(z.literal('')),
});
export type EntityDetailsInput = z.infer<typeof entityDetailsSchema>;

export const headerSchema = z.object({
  header_name: z.string().trim().min(2, 'Header name is required'),
  sender_id: z.string().trim().regex(/^[A-Za-z0-9]{3,11}$/, 'Sender ID must be 3-11 alphanumeric characters'),
  header_type: z.enum(['ALPHANUMERIC', 'NUMERIC', 'SHORTCODE']).default('ALPHANUMERIC'),
  ussd: z.string().trim().optional().or(z.literal('')),
});

export const templateSchema = z.object({
  header_id: z.string().uuid('Select an approved header'),
  template_name: z.string().trim().min(2, 'Template name is required'),
  category: z.enum(['TRANSACTIONAL', 'OTP', 'PROMOTIONAL', 'SERVICE']).default('TRANSACTIONAL'),
  // SMS only — the platform registers SMS templates exclusively, so the channel
  // is fixed rather than chosen.
  channel: z.literal('SMS').default('SMS'),
  dlt_template_id: z.string().trim().optional().or(z.literal('')),
  body: z.string().trim().min(5, 'Template body is required'),
  variables: z.string().trim().optional().or(z.literal('')),
  variable_samples: z.record(z.string()).default({}),
}).superRefine((v, ctx) => {
  const declared = extractVariables(v.body);
  for (const name of declared) {
    const sample = (v.variable_samples?.[name] ?? '').trim();
    if (!sample) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variable_samples', name],
        message: `Sample content is required for <${name}>`,
      });
    }
  }
  // A body must not reference a variable that was never declared — keeps the
  // approver's preview honest.
  const strays = Array.from(v.body.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)).map((m) => m[1]);
  if (strays.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: `Use the <var1>, <var2> … format for variables (found {{${strays[0]}}})`,
    });
  }
});

export const urlSchema = z.object({
  template_id: z.string().uuid('Select an approved template'),
  url: z.string().trim().url('Enter a valid URL'),
  method: z.enum(['GET', 'POST']).default('POST'),
  callback_type: z.enum(['DLT', 'SMS', 'WHATSAPP']).default('DLT'),
});

export const reviewActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CORRECTION', 'START_REVIEW']),
  remarks: z.string().trim().optional().or(z.literal('')),
});

export const docReviewSchema = z.object({
  status: z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'RESUBMISSION_REQUIRED']),
  remarks: z.string().trim().optional().or(z.literal('')),
});

export const providerSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  provider_name: z.string().trim().min(2, 'Provider name is required'),
  base_url: z.string().trim().url('Enter a valid endpoint URL'),
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).default('POST'),
  headers: z.record(z.string()).default({}),
  query_params: z.record(z.string()).default({}),
  body_template: z.string().nullable().optional(),
  auth_type: z.enum(['NONE', 'BEARER', 'BASIC', 'API_KEY']).default('NONE'),
  auth_config: z.record(z.string()).default({}),
  timeout_ms: z.number().int().min(1000).max(60000).default(15000),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// File validation (extension + MIME + size) — appendix item 2
// ---------------------------------------------------------------------------
export interface FileMeta {
  name: string;
  type: string;
  size: number;
}
export interface FileRule {
  maxMb?: number;
  allowedMime?: readonly string[];
}
export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

const EXT_BY_MIME: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/jpg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};

export function validateKycFile(meta: FileMeta, rule: FileRule = {}): FileValidationResult {
  const maxMb = rule.maxMb ?? DEFAULT_MAX_KYC_FILE_MB;
  const allowed = rule.allowedMime ?? KYC_ALLOWED_MIME;

  if (!meta.name || !meta.type) return { ok: false, error: 'File is missing a name or type.' };
  const sizeMb = meta.size / (1024 * 1024);
  if (sizeMb > maxMb) return { ok: false, error: `File exceeds the ${maxMb} MB limit.` };
  if (meta.size <= 0) return { ok: false, error: 'File is empty.' };
  if (!allowed.includes(meta.type)) {
    return { ok: false, error: `Unsupported file type "${meta.type}". Allowed: PDF, JPG, JPEG, PNG.` };
  }
  const ext = (meta.name.split('.').pop() ?? '').toLowerCase();
  const expected = EXT_BY_MIME[meta.type] ?? [];
  if (!expected.includes(ext)) {
    return { ok: false, error: `File extension .${ext} does not match its content type (${meta.type}).` };
  }
  return { ok: true };
}

export function maxKycFileBytes(maxMb = DEFAULT_MAX_KYC_FILE_MB): number {
  return maxMb * 1024 * 1024;
}
