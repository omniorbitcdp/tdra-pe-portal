import { describe, it, expect } from 'vitest';
import { entityDetailsSchema, headerSchema, templateSchema, validateKycFile, registerSchema } from '@/lib/validation';

const validEntity = {
  legal_entity_name: 'Acme Telecom FZ-LLC', entity_type: 'Free zone company',
  trade_licence_number: 'DED-1', registered_address: 'Office 1, Dubai', country: 'United Arab Emirates',
  emirate: 'Dubai', city: 'Dubai', industry: 'Telecommunications', business_description: 'Enterprise messaging provider.',
  signatory_name: 'Rajesh Menon', signatory_designation: 'MD', official_email: 'a@b.com', mobile: '+971500000000',
};

describe('entity details schema', () => {
  it('accepts a valid payload', () => {
    expect(entityDetailsSchema.safeParse(validEntity).success).toBe(true);
  });
  it('requires an emirate from the UAE list', () => {
    expect(entityDetailsSchema.safeParse({ ...validEntity, emirate: 'Delhi' }).success).toBe(false);
  });
  it('rejects a malformed TRN', () => {
    expect(entityDetailsSchema.safeParse({ ...validEntity, vat_trn: '123' }).success).toBe(false);
    expect(entityDetailsSchema.safeParse({ ...validEntity, vat_trn: '100123456700003' }).success).toBe(true);
  });
  it('rejects a bad mobile number', () => {
    expect(entityDetailsSchema.safeParse({ ...validEntity, mobile: 'abc' }).success).toBe(false);
  });
});

describe('header + template schemas', () => {
  it('enforces sender id rules', () => {
    expect(headerSchema.safeParse({ header_name: 'Acme', sender_id: 'ACME' }).success).toBe(true);
    expect(headerSchema.safeParse({ header_name: 'Acme', sender_id: 'ab' }).success).toBe(false);
  });
  it('requires a uuid header reference for templates', () => {
    expect(templateSchema.safeParse({ header_id: 'not-a-uuid', template_name: 'x', body: 'hello there' }).success).toBe(false);
  });
});

describe('file validation (extension + MIME + size)', () => {
  it('accepts a compliant PDF', () => {
    expect(validateKycFile({ name: 'licence.pdf', type: 'application/pdf', size: 1_000_000 }).ok).toBe(true);
  });
  it('accepts JPG and PNG', () => {
    expect(validateKycFile({ name: 'id.jpg', type: 'image/jpeg', size: 500_000 }).ok).toBe(true);
    expect(validateKycFile({ name: 'id.png', type: 'image/png', size: 500_000 }).ok).toBe(true);
  });
  it('rejects unsupported types and extensions', () => {
    expect(validateKycFile({ name: 'x.txt', type: 'text/plain', size: 10 }).ok).toBe(false);
    expect(validateKycFile({ name: 'x.exe', type: 'application/pdf', size: 10 }).ok).toBe(false);
  });
  it('enforces the size limit (default 5 MB)', () => {
    expect(validateKycFile({ name: 'big.pdf', type: 'application/pdf', size: 6 * 1024 * 1024 }).ok).toBe(false);
    expect(validateKycFile({ name: 'ok.pdf', type: 'application/pdf', size: 4 * 1024 * 1024 }).ok).toBe(true);
  });
  it('rejects empty files', () => {
    expect(validateKycFile({ name: 'e.pdf', type: 'application/pdf', size: 0 }).ok).toBe(false);
  });
});

describe('registration schema', () => {
  it('requires a policy-length password field and valid email', () => {
    expect(registerSchema.safeParse({ email: 'bad', password: 'short', full_name: 'A B', phone: '+971500000000' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'Str0ng!Pass', full_name: 'A B', phone: '+971500000000' }).success).toBe(true);
  });
});
