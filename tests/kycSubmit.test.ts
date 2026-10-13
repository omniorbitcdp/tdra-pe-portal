import { describe, it, expect } from 'vitest';
import { canSubmitKycPack, missingEntityFields } from '@/lib/workflow';

const fullEntity = {
  kyc_status: 'DRAFT' as const,
  legal_entity_name: 'ABC Limited', entity_type: 'Free zone company', trade_licence_number: '1234567899',
  registered_address: 'G-1901 BPTP Park Prime, Sector 66', emirate: 'Dubai', city: 'Dubai',
  industry: 'Banking & Finance', business_description: 'A test entity for the TDRA portal.',
  signatory_name: 'Puneet Bhargava', signatory_designation: 'Director',
  official_email: 'puneet@example.com', mobile: '+971500000000',
};

const allDocs = [
  { doc_type: 'TRADE_LICENCE' as const }, { doc_type: 'EMIRATES_ID' as const },
  { doc_type: 'SIGNATORY_LETTER' as const }, { doc_type: 'VAT_CERTIFICATE' as const },
];

describe('KYC pack submission gate', () => {
  it('allows submission when all fields are filled and all 4 documents uploaded', () => {
    const g = canSubmitKycPack(fullEntity, allDocs);
    expect(g.ok).toBe(true);
    expect(g.missingDocuments).toHaveLength(0);
    expect(g.missingFields).toHaveLength(0);
  });

  it('blocks submission until all four documents are uploaded', () => {
    const g = canSubmitKycPack(fullEntity, allDocs.slice(0, 3));
    expect(g.ok).toBe(false);
    expect(g.missingDocuments).toContain('VAT_CERTIFICATE');
  });

  it('blocks submission while entity fields are missing', () => {
    const g = canSubmitKycPack({ ...fullEntity, signatory_name: '' }, allDocs);
    expect(g.ok).toBe(false);
    expect(g.missingFields).toContain('Authorised signatory full name');
  });

  it('reports every missing field for an empty entity', () => {
    expect(missingEntityFields(null).length).toBeGreaterThan(8);
  });

  it('never allows resubmission of an already approved KYC', () => {
    expect(canSubmitKycPack({ ...fullEntity, kyc_status: 'APPROVED' as never }, allDocs).ok).toBe(false);
  });

  it('allows resubmission after clarification or rejection', () => {
    expect(canSubmitKycPack({ ...fullEntity, kyc_status: 'CLARIFICATION_REQUIRED' as never }, allDocs).ok).toBe(true);
    expect(canSubmitKycPack({ ...fullEntity, kyc_status: 'REJECTED' as never }, allDocs).ok).toBe(true);
  });
});
