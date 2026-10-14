// Bootstraps route handlers for direct invocation: mocks the DB, the cookie jar
// and next/server, then signs a session in as any role.
import { vi } from 'vitest';
import { cookies } from './nextHeaders';
import { createSessionToken } from '@/lib/session';
import { SESSION_COOKIE, type Role } from '@/lib/constants';
import { resetDb } from './mockDb';
import { seed, PE_A_ENTITY, PE_B_ENTITY, IDS } from './seed';

export { PE_A_ENTITY, PE_B_ENTITY, IDS };

/** Fresh, fully seeded database for each test. */
export function freshDb() {
  resetDb(seed());
}

export interface SessionSpec {
  uid: string; email: string; role: Role; entityId: string | null; name?: string;
}

export const SESSIONS: Record<string, SessionSpec> = {
  peA: { uid: IDS.peAUser, email: 'pe-a@x.ae', role: 'PE', entityId: PE_A_ENTITY, name: 'PE Alpha' },
  peB: { uid: IDS.peBUser, email: 'pe-b@x.ae', role: 'PE', entityId: PE_B_ENTITY, name: 'PE Bravo' },
  peNoEntity: { uid: 'u-pe-new', email: 'new@x.ae', role: 'PE', entityId: null, name: 'New PE' },
  kyc: { uid: IDS.kyc, email: 'kyc@op.demo', role: 'OPERATOR_KYC', entityId: null, name: 'KYC Reviewer' },
  header: { uid: IDS.header, email: 'hdr@op.demo', role: 'OPERATOR_HEADER', entityId: null, name: 'Header Reviewer' },
  tpl: { uid: IDS.tpl, email: 'tpl@op.demo', role: 'OPERATOR_TEMPLATE_URL', entityId: null, name: 'Template Reviewer' },
  admin: { uid: IDS.admin, email: 'admin@x.demo', role: 'ADMIN', entityId: null, name: 'Platform Admin' },
};

export async function signInAs(key: keyof typeof SESSIONS | null): Promise<void> {
  if (key === null) { cookies().delete(SESSION_COOKIE); return; }
  const spec = SESSIONS[key];
  const token = await createSessionToken({ uid: spec.uid, email: spec.email, role: spec.role, entityId: spec.entityId, name: spec.name }, 1);
  cookies().set(SESSION_COOKIE, token);
}

export interface FakeRequest {
  url: string;
  nextUrl: { searchParams: URLSearchParams; clone(): FakeRequest['nextUrl']; pathname: string };
  headers: Headers;
  json(): Promise<unknown>;
  formData(): Promise<FormData>;
}

export function makeRequest(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): FakeRequest {
  const url = new URL(path, 'http://localhost');
  const self = {
    url: url.toString(),
    headers: new Headers({ 'x-forwarded-for': '10.0.0.1' }),
    async json() { return opts.body ?? {}; },
    async formData() { return opts.form ?? new FormData(); },
  } as FakeRequest;
  const nextUrl = {
    pathname: url.pathname,
    searchParams: url.searchParams,
    clone(): FakeRequest['nextUrl'] { return { pathname: url.pathname, searchParams: new URLSearchParams(url.searchParams), clone: () => this as never } as never; },
  };
  self.nextUrl = nextUrl;
  return self;
}

/** Params object as Next passes it for dynamic segments. */
export function params<T extends Record<string, string>>(p: T) { return { params: p }; }

export const mocks = { vi };
