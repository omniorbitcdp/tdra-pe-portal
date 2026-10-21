/**
 * Regression: the KYC reviewer's split-screen page previews documents through
 * the shared route /api/pe/kyc/file. The edge must let OPERATOR_KYC and ADMIN
 * through it, while every other /api/pe path stays PE-only and PE ownership is
 * still enforced by the handler.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { middleware } from '@/middleware';
import { freshDb, signInAs, makeRequest, PE_A_ENTITY, IDS } from './helpers/harness';
import { createSessionToken } from '@/lib/session';
import { SESSION_COOKIE, type Role } from '@/lib/constants';
import * as peKycFile from '@/app/api/pe/kyc/file/route';

const status = (r: unknown) => (r as { status: number }).status;
const body = (r: unknown) => (r as { _data: any })._data;

// --- edge middleware ---
async function edge(pathname: string, role?: Role) {
  const url = new URL(pathname, 'http://localhost');
  const token = role
    ? await createSessionToken({ uid: 'u1', email: 'x@y.z', role, entityId: role === 'PE' ? PE_A_ENTITY : null, name: 'T' }, 1)
    : null;
  const clone = () => ({
    pathname: url.pathname, search: '',
    searchParams: new URLSearchParams(url.searchParams),
    toString: () => `http://localhost${url.pathname}`,
  });
  return middleware({
    nextUrl: { pathname: url.pathname, clone },
    cookies: { get: (n: string) => (token && n === SESSION_COOKIE ? { name: n, value: token } : undefined) },
  } as never) as unknown as Promise<{ status: number; headers: { get(k: string): string | null } }>;
}

describe('edge: shared document preview', () => {
  it('lets the KYC approver through /api/pe/kyc/file', async () => {
    const res = await edge('/api/pe/kyc/file', 'OPERATOR_KYC');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets the admin through /api/pe/kyc/file', async () => {
    expect((await edge('/api/pe/kyc/file', 'ADMIN')).status).toBe(200);
  });

  it('still lets the PE through', async () => {
    expect((await edge('/api/pe/kyc/file', 'PE')).status).toBe(200);
  });

  it('keeps a header approver out of it', async () => {
    const res = await edge('/api/pe/kyc/file', 'OPERATOR_HEADER');
    expect(res.status).toBe(403);
  });

  it('keeps a template/URL approver out of it', async () => {
    expect((await edge('/api/pe/kyc/file', 'OPERATOR_TEMPLATE_URL')).status).toBe(403);
  });

  it('does not widen any other /api/pe route — no regression', async () => {
    for (const p of ['/api/pe/profile', '/api/pe/dashboard', '/api/pe/kyc', '/api/pe/headers', '/api/pe/templates', '/api/pe/urls']) {
      expect((await edge(p, 'OPERATOR_KYC')).status, p).toBe(403);
      expect((await edge(p, 'ADMIN')).status, p).toBe(403);
      expect((await edge(p, 'PE')).status, p).toBe(200);
    }
  });

  it('a path merely resembling the shared one is not exempt', async () => {
    expect((await edge('/api/pe/kyc/file-export', 'OPERATOR_KYC')).status).toBe(403);
  });
});

// --- handler-level ownership, unchanged ---
describe('handler: document access inside the shared route', () => {
  beforeEach(() => { freshDb(); });

  it('KYC approver can preview any submitted document', async () => {
    await signInAs('kyc');
    const res = await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docB}`) as never);
    expect(status(res)).toBe(200);
    expect(body(res).url).toBeTruthy();
  });

  it('PE still cannot preview another entity\'s document', async () => {
    await signInAs('peA');
    const res = await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docB}`) as never);
    expect(status(res)).toBe(403);
  });

  it('PE can preview its own document', async () => {
    await signInAs('peA');
    expect(status(await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docA}`) as never))).toBe(200);
  });

  it('a header approver is refused by the handler too', async () => {
    await signInAs('header');
    expect(status(await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docA}`) as never))).toBe(403);
  });

  it('anonymous callers are refused', async () => {
    await signInAs(null);
    expect(status(await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docA}`) as never))).toBe(401);
  });
});
