// Session + RBAC helpers. Every protected API/page calls getSession() and
// guard(), so access is enforced server-side (requirements §11, §12).
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { SESSION_COOKIE, type Role } from './constants';
import { createSessionToken, verifySessionToken, type SessionPayload } from './session';
import { forbidden, unauthorized } from './http';

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Returns a 401/403 NextResponse when access is denied, otherwise null. */
export function guard(session: SessionPayload | null, roles?: Role[]): NextResponse | null {
  if (!session) return unauthorized();
  if (roles && roles.length > 0 && !roles.includes(session.role)) return forbidden();
  return null;
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? '12');
  const token = await createSessionToken(payload, ttlHours);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttlHours * 3600,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Landing route for a role after login. */
export function homeForRole(role: Role): string {
  switch (role) {
    case 'PE': return '/pe';
    case 'ADMIN': return '/admin';
    default: return '/operator';
  }
}
