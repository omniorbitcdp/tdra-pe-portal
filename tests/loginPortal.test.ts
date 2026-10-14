/**
 * The Enterprise / Telco door on the login screen is enforced server-side: an
 * account can only sign in through the tab its role belongs to.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { signInAs, makeRequest, params } from './helpers/harness';
import { resetDb } from './helpers/mockDb';
import { seed } from './helpers/seed';
import { hashPassword } from '@/lib/password';
import * as auth from '@/app/api/auth/[action]/route';

const PW = 'Secret@123';
const status = (r: unknown) => (r as { status: number }).status;
const body = (r: unknown) => (r as { _data: any })._data;

beforeEach(async () => {
  await signInAs(null);
  const t = seed();
  const hash = await hashPassword(PW);
  t.app_users = t.app_users.map((u) => ({ ...u, password_hash: hash, status: 'ACTIVE', failed_login_attempts: 0, locked_until: null }));
  resetDb(t);
});

const login = (email: string, portal?: 'ENTERPRISE' | 'TELCO') =>
  auth.POST(
    makeRequest('/api/auth/login', { body: { email, password: PW, ...(portal ? { portal } : {}) } }) as never,
    params({ action: 'login' }) as never,
  );

describe('Enterprise tab', () => {
  it('lets a business account in and sends it to its dashboard', async () => {
    const res = await login('pe-a@x.ae', 'ENTERPRISE');
    expect(status(res)).toBe(200);
    expect(body(res).redirect).toBe('/pe');
    expect(body(res).role).toBe('PE');
  });

  it('refuses a KYC approver', async () => {
    const res = await login('kyc@op.demo', 'ENTERPRISE');
    expect(status(res)).toBe(403);
    expect(body(res).error).toContain('Telco');
  });

  it('refuses an admin', async () => {
    expect(status(await login('admin@x.demo', 'ENTERPRISE'))).toBe(403);
  });
});

describe('Telco tab', () => {
  it('lets the KYC approver in', async () => {
    const res = await login('kyc@op.demo', 'TELCO');
    expect(status(res)).toBe(200);
    expect(body(res).redirect).toBe('/operator');
  });

  it('lets the header approver in', async () => {
    expect(status(await login('hdr@op.demo', 'TELCO'))).toBe(200);
  });

  it('lets the template/URL approver in', async () => {
    expect(status(await login('tpl@op.demo', 'TELCO'))).toBe(200);
  });

  it('lets the administrator in', async () => {
    const res = await login('admin@x.demo', 'TELCO');
    expect(status(res)).toBe(200);
    expect(body(res).redirect).toBe('/admin');
  });

  it('refuses a business account', async () => {
    const res = await login('pe-a@x.ae', 'TELCO');
    expect(status(res)).toBe(403);
    expect(body(res).error).toContain('Enterprise');
  });
});

describe('unchanged behaviour', () => {
  it('signs in without a portal choice (older clients, direct API calls)', async () => {
    expect(status(await login('pe-a@x.ae'))).toBe(200);
    expect(status(await login('admin@x.demo'))).toBe(200);
  });

  it('still rejects a wrong password at either door', async () => {
    const bad = auth.POST(
      makeRequest('/api/auth/login', { body: { email: 'pe-a@x.ae', password: 'wrong', portal: 'ENTERPRISE' } }) as never,
      params({ action: 'login' }) as never,
    );
    expect(status(await bad)).toBe(401);
  });

  it('never reveals whether an address exists', async () => {
    const res = await login('nobody@nowhere.test', 'ENTERPRISE');
    expect(status(res)).toBe(401);
    expect(body(res).error).toBe('Invalid email or password.');
  });
});
