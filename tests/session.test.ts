import { describe, it, expect, beforeAll } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/session';

beforeAll(() => { process.env.SESSION_SECRET = 'unit-test-secret-value-32-characters-min'; });

describe('session tokens', () => {
  it('round-trips a session payload', async () => {
    const token = await createSessionToken({ uid: 'u1', email: 'a@b.com', role: 'PE', entityId: 'e1' }, 1);
    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe('u1');
    expect(payload!.role).toBe('PE');
    expect(payload!.entityId).toBe('e1');
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken({ uid: 'u1', email: 'a@b.com', role: 'PE', entityId: null }, 1);
    const tampered = token.slice(0, -3) + 'xyz';
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    process.env.SESSION_SECRET = 'a-different-secret-value-32-characters!!';
    const token = await createSessionToken({ uid: 'u1', email: 'a@b.com', role: 'ADMIN', entityId: null }, 1);
    process.env.SESSION_SECRET = 'unit-test-secret-value-32-characters-min';
    expect(await verifySessionToken(token)).toBeNull();
  });
});
