import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimit, clientIp } from '@/lib/rateLimit';

beforeEach(() => resetRateLimit());

describe('rate limiting', () => {
  it('allows up to the limit then blocks with a retry hint', () => {
    const opts = { max: 3, windowMs: 60_000 };
    const t0 = 1_000_000;
    expect(rateLimit('k', opts, t0).ok).toBe(true);
    expect(rateLimit('k', opts, t0 + 1).ok).toBe(true);
    expect(rateLimit('k', opts, t0 + 2).ok).toBe(true);
    const blocked = rateLimit('k', opts, t0 + 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('frees the window once events age out', () => {
    const opts = { max: 1, windowMs: 1000 };
    expect(rateLimit('k', opts, 0).ok).toBe(true);
    expect(rateLimit('k', opts, 500).ok).toBe(false);
    expect(rateLimit('k', opts, 1500).ok).toBe(true);
  });

  it('isolates buckets by key', () => {
    const opts = { max: 1, windowMs: 1000 };
    expect(rateLimit('a', opts, 0).ok).toBe(true);
    expect(rateLimit('b', opts, 0).ok).toBe(true);
  });

  it('derives the client ip from proxy headers', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
