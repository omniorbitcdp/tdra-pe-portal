import { describe, it, expect } from 'vitest';
import {
  canCreateHeader, canCreateTemplate, canCreateUrl, canApproveKyc, isKycPackComplete,
  canTransition, targetStatusFor, actionRequiresRemarks,
} from '@/lib/workflow';

const entity = (s: string) => ({ kyc_status: s as never });
const allDocs = [
  { doc_type: 'TRADE_LICENCE' as const, status: 'VERIFIED' },
  { doc_type: 'EMIRATES_ID' as const, status: 'VERIFIED' },
  { doc_type: 'SIGNATORY_LETTER' as const, status: 'VERIFIED' },
  { doc_type: 'VAT_CERTIFICATE' as const, status: 'VERIFIED' },
];

describe('sequence enforcement (KYC -> Header -> Template -> URL)', () => {
  it('blocks header registration until KYC is APPROVED', () => {
    expect(canCreateHeader(entity('SUBMITTED')).ok).toBe(false);
    expect(canCreateHeader(entity('APPROVED')).ok).toBe(true);
  });

  it('blocks template registration unless the header is APPROVED', () => {
    expect(canCreateTemplate(entity('APPROVED'), { status: 'SUBMITTED' as never }).ok).toBe(false);
    expect(canCreateTemplate(entity('APPROVED'), null).ok).toBe(false);
    expect(canCreateTemplate(entity('APPROVED'), { status: 'APPROVED' as never }).ok).toBe(true);
  });

  it('blocks URL registration unless the template is APPROVED', () => {
    expect(canCreateUrl(entity('APPROVED'), { status: 'SUBMITTED' as never }).ok).toBe(false);
    expect(canCreateUrl(entity('APPROVED'), { status: 'APPROVED' as never }).ok).toBe(true);
  });

  it('blocks template/URL when KYC itself is not approved', () => {
    expect(canCreateTemplate(entity('SUBMITTED'), { status: 'APPROVED' as never }).ok).toBe(false);
    expect(canCreateUrl(entity('SUBMITTED'), { status: 'APPROVED' as never }).ok).toBe(false);
  });
});

describe('KYC approval gating', () => {
  it('requires all four documents verified AND info approved', () => {
    expect(canApproveKyc(allDocs, true).ok).toBe(true);
    expect(canApproveKyc(allDocs, false).ok).toBe(false);
    expect(canApproveKyc(allDocs.slice(0, 3), true).ok).toBe(false);
    const withPending = allDocs.map((d, i) => (i === 1 ? { doc_type: d.doc_type, status: 'PENDING_VERIFICATION' } : d));
    expect(canApproveKyc(withPending, true).ok).toBe(false);
  });

  it('isKycPackComplete reflects verified documents only', () => {
    expect(isKycPackComplete(allDocs)).toBe(true);
    expect(isKycPackComplete(allDocs.slice(1))).toBe(false);
  });
});

describe('status transitions', () => {
  it('allows valid transitions and blocks invalid ones', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canTransition('CLARIFICATION_REQUIRED', 'RESUBMITTED')).toBe(true);
    expect(canTransition('APPROVED', 'SUBMITTED')).toBe(false);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
  });
  it('maps actions to target statuses and requires remarks for reject/correction', () => {
    expect(targetStatusFor('APPROVE')).toBe('APPROVED');
    expect(targetStatusFor('REQUEST_CORRECTION')).toBe('CLARIFICATION_REQUIRED');
    expect(actionRequiresRemarks('REJECT')).toBe(true);
    expect(actionRequiresRemarks('REQUEST_CORRECTION')).toBe(true);
    expect(actionRequiresRemarks('APPROVE')).toBe(false);
  });
});
