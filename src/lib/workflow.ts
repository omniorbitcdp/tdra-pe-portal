// Workflow / sequence rules — requirements §6, §12 and appendix item 4.
// These are PURE functions; the API routes and the DB triggers both call the
// same rules, so the sequence cannot be bypassed by hitting an API directly.
import {
  MANDATORY_DOC_TYPES, type DocType, type RegStatus,
} from './constants';

export interface SequenceContext {
  kycApproved: boolean;
  headerApproved: boolean;
  templateApproved: boolean;
}

export interface GateResult {
  ok: boolean;
  reason?: string;
}

const ok: GateResult = { ok: true };
const fail = (reason: string): GateResult => ({ ok: false, reason });

/** §6 / §4 step 2 — KYC pack submitted before review */
export function canSubmitKyc(entity: { kyc_status: RegStatus } | null): GateResult {
  if (!entity) return fail('Entity profile not created yet.');
  if (entity.kyc_status === 'APPROVED') return fail('KYC is already approved.');
  return ok;
}

/** §5 / §7.2 / §12 — KYC approval blocked until ALL four docs verified
 *  AND the submitted PE information approved. */
export function canApproveKyc(
  docs: Array<{ doc_type: DocType; status: string }>,
  infoApproved: boolean,
): GateResult {
  const byType = new Map(docs.map((d) => [d.doc_type, d.status]));
  const missing: DocType[] = [];
  const unverified: DocType[] = [];
  for (const t of MANDATORY_DOC_TYPES) {
    const st = byType.get(t);
    if (!st) missing.push(t);
    else if (st !== 'VERIFIED') unverified.push(t);
  }
  if (missing.length) return fail(`Missing mandatory document(s): ${missing.join(', ')}`);
  if (unverified.length) return fail(`Document(s) not verified: ${unverified.join(', ')}`);
  if (!infoApproved) return fail('PE information has not been approved.');
  return ok;
}

/** Is the mandatory KYC pack complete & fully verified? */
export function isKycPackComplete(docs: Array<{ doc_type: DocType; status: string }>): boolean {
  const verified = new Set(docs.filter((d) => d.status === 'VERIFIED').map((d) => d.doc_type));
  return MANDATORY_DOC_TYPES.every((t) => verified.has(t));
}

/** §6 — Header registration requires approved KYC. */
export function canCreateHeader(ctx: { kyc_status: RegStatus } | null): GateResult {
  if (!ctx) return fail('Entity profile not found.');
  if (ctx.kyc_status !== 'APPROVED') return fail('KYC must be approved before registering a header.');
  return ok;
}

/** §6 — Template registration requires an APPROVED header (header precedes template). */
export function canCreateTemplate(
  entity: { kyc_status: RegStatus } | null,
  header: { status: RegStatus } | null,
): GateResult {
  if (!entity) return fail('Entity profile not found.');
  if (entity.kyc_status !== 'APPROVED') return fail('KYC must be approved first.');
  if (!header) return fail('A header registration is required before a template.');
  if (header.status !== 'APPROVED') return fail('The selected header must be APPROVED before a template can be registered.');
  return ok;
}

/** §6 / appendix 4 — URL registration requires an APPROVED template. */
export function canCreateUrl(
  entity: { kyc_status: RegStatus } | null,
  template: { status: RegStatus } | null,
): GateResult {
  if (!entity) return fail('Entity profile not found.');
  if (entity.kyc_status !== 'APPROVED') return fail('KYC must be approved first.');
  if (!template) return fail('A template registration is required before a URL.');
  if (template.status !== 'APPROVED') return fail('The selected template must be APPROVED before a URL can be registered.');
  return ok;
}

/** Human-readable dependency checklist for the PE UI. */
export function sequenceContextFrom(
  entity: { kyc_status: RegStatus } | null,
  headers: Array<{ status: RegStatus }>,
  templates: Array<{ status: RegStatus }>,
): SequenceContext {
  return {
    kycApproved: entity?.kyc_status === 'APPROVED',
    headerApproved: headers.some((h) => h.status === 'APPROVED'),
    templateApproved: templates.some((t) => t.status === 'APPROVED'),
  };
}

const TRANSITIONS: Record<string, RegStatus[]> = {
  // from-status -> allowed next statuses (used to validate status changes)
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'APPROVED', 'REJECTED'],
  UNDER_REVIEW: ['CLARIFICATION_REQUIRED', 'APPROVED', 'REJECTED'],
  CLARIFICATION_REQUIRED: ['RESUBMITTED'],
  RESUBMITTED: ['UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: ['RESUBMITTED'],
};

export function canTransition(from: RegStatus, to: RegStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export type Action = 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTION' | 'START_REVIEW' | 'SUBMIT' | 'RESUBMIT';

export function targetStatusFor(action: Action): RegStatus {
  switch (action) {
    case 'SUBMIT': return 'SUBMITTED';
    case 'RESUBMIT': return 'RESUBMITTED';
    case 'START_REVIEW': return 'UNDER_REVIEW';
    case 'APPROVE': return 'APPROVED';
    case 'REJECT': return 'REJECTED';
    case 'REQUEST_CORRECTION': return 'CLARIFICATION_REQUIRED';
  }
}

/** Rejection / correction always require remarks (§7.1, §12). */
export function actionRequiresRemarks(action: Action): boolean {
  return action === 'REJECT' || action === 'REQUEST_CORRECTION';
}
