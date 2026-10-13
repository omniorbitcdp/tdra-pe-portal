import { describe, it, expect } from 'vitest';
import { sha256Hex, randomToken, generateOtp, safeEqual } from '@/lib/crypto';

describe('crypto helpers', () => {
  it('sha256 is deterministic and 64 hex chars', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('randomToken returns unique url-safe strings', () => {
    const a = randomToken(); const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('generateOtp returns the requested number of digits', () => {
    const otp = generateOtp(6);
    expect(otp).toMatch(/^[0-9]{6}$/);
  });
  it('safeEqual compares correctly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('ab', 'abc')).toBe(false);
  });
});
