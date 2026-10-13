import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, passwordPolicyErrors, isPasswordCompliant } from '@/lib/password';

describe('password hashing', () => {
  it('produces a bcrypt hash that is not the plain text', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd');
    expect(hash).not.toBe('Str0ng!Passw0rd');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('verifies the correct password and rejects the wrong one', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd');
    expect(await verifyPassword('Str0ng!Passw0rd', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('uses a fresh salt each time (two hashes differ)', async () => {
    const a = await hashPassword('Str0ng!Passw0rd');
    const b = await hashPassword('Str0ng!Passw0rd');
    expect(a).not.toBe(b);
  });

  it('never returns the plain text and handles empty input safely', async () => {
    expect(await verifyPassword('', '')).toBe(false);
  });
});

describe('password policy', () => {
  it('accepts a compliant password', () => {
    expect(isPasswordCompliant('Str0ng!Passw0rd')).toBe(true);
    expect(passwordPolicyErrors('Str0ng!Passw0rd')).toEqual([]);
  });
  it('rejects short, lowercase-only and digit-less passwords', () => {
    expect(passwordPolicyErrors('abc')).not.toHaveLength(0);
    expect(passwordPolicyErrors('alllowercase')).not.toHaveLength(0);
    expect(passwordPolicyErrors('NoDigitsHere!')).not.toHaveLength(0);
  });
});
