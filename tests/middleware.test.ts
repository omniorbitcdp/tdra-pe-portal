/**
 * Edge middleware: the first line of defence. Verifies that the wrong role (or an
 * anonymous caller) is stopped BEFORE a page or API handler ever runs, and that
 * API callers receive JSON rather than an HTML redirect.
 */
import { describe, it, expect } from 'vitest';
import { middleware } from '@/middleware';
import { createSessionToken } from '@/lib/session';
import { SESSION_COOKIE, type Role } from '@/lib/constants';

interface FakeRes { status: number; headers: { get(k: string): string | null } }

async function reqFor(pathname: string, role?: Role | null) {
  const url = new URL(pathname, 'http://localhost');
  const token = role ? await createSessionToken({ uid: 'u1', email: 'x@y.z', role, entityId: role === 'PE' ? 'ent-aaaa-1111' : null, name: 'T' }, 1) : null;
  const clone = () => {
    const o: Record<string, unknown> = {
      pathname: url.pathname,
      search: '',
      searchParams: new URLSearchParams(url.searchParams),
      toString: () => `http://localhost${o.pathname}${(o.searchParams as URLSearchParams).toString() ? '?' + (o.searchParams as URLSearchParams).toString() : ''}`,
    };
    return o;
  };
  return {
    nextUrl: { pathname: url.pathname, clone },
    cookies: { get: (n: string) => (token && n === SESSION_COOKIE ? { name: n, value: token } : undefined) },
  } as never;
}

const run = (p: string, role?: Role | null) => reqFor(p, role).then((r) => middleware(r as never) as unknown as Promise<FakeRes>);

describe('anonymous callers', () => {
  it('page → redirected to /login with a next param', async () => {
    const res = await run('/pe/profile', null);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('next=%2Fpe%2Fprofile');
  });

  it('API → 401 JSON, never a redirect', async () => {
    const res = await run('/api/pe/profile', null);
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBeNull();
  });

  it('admin API → 401 JSON', async () => {
    expect((await run('/api/admin/users', null)).status).toBe(401);
  });
});

describe('wrong role is bounced at the edge', () => {
  it('PE hitting an operator page goes home, not into the queue', async () => {
    const res = await run('/operator/kyc', 'PE');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/pe');
  });

  it('PE hitting the operator API gets 403 JSON', async () => {
    expect((await run('/api/operator/queue', 'PE')).status).toBe(403);
  });

  it('PE hitting the admin API gets 403 JSON', async () => {
    expect((await run('/api/admin/audit', 'PE')).status).toBe(403);
  });

  it('KYC approver hitting the admin API gets 403 JSON', async () => {
    expect((await run('/api/admin/users', 'OPERATOR_KYC')).status).toBe(403);
  });

  it('operator hitting the PE API gets 403 JSON', async () => {
    expect((await run('/api/pe/dashboard', 'OPERATOR_HEADER')).status).toBe(403);
  });

  it('KYC approver cannot open the header queue page', async () => {
    const res = await run('/operator/headers', 'OPERATOR_KYC');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('denied=1');
  });

  it('template approver cannot open the KYC queue page', async () => {
    expect((await run('/operator/kyc', 'OPERATOR_TEMPLATE_URL')).status).toBe(307);
  });
});

describe('permitted callers pass through', () => {
  const ok: Array<[string, Role]> = [
    ['/pe/profile', 'PE'],
    ['/pe/kyc', 'PE'],
    ['/api/pe/profile', 'PE'],
    ['/api/pe/kyc/file', 'PE'],
    ['/operator/kyc', 'OPERATOR_KYC'],
    ['/operator/kyc/ent-aaaa-1111', 'OPERATOR_KYC'],
    ['/operator/headers', 'OPERATOR_HEADER'],
    ['/operator/templates', 'OPERATOR_TEMPLATE_URL'],
    ['/operator/urls', 'OPERATOR_TEMPLATE_URL'],
    ['/api/operator/queue', 'OPERATOR_KYC'],
    ['/api/operator/summary', 'OPERATOR_HEADER'],
    ['/api/operator/decision', 'OPERATOR_TEMPLATE_URL'],
    ['/admin/audit', 'ADMIN'],
    ['/operator/kyc', 'ADMIN'],
    ['/api/admin/providers', 'ADMIN'],
    ['/api/operator/queue', 'ADMIN'],
  ];
  for (const [path, role] of ok) {
    it(`${role} → ${path} passes`, async () => {
      const res = await run(path, role);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });
  }
});

describe('unrelated paths are untouched', () => {
  for (const p of ['/login', '/register', '/forgot', '/reset', '/api/auth/me', '/api/settings', '/']) {
    it(`${p} is not intercepted`, async () => {
      const res = await run(p, null);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });
  }
});
