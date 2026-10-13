// Session + RBAC helpers. Every protected API/page calls getSession() and
// guard(), so access is enforced server-side (requirements §11, §12).
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { SESSION_COOKIE, type Role } from './constants';
import { db } from './db';
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

/**
 * Resolve the entity a PE session belongs to.
 *
 * The JWT is minted at sign-in, so a PE who creates their entity profile
 * *after* logging in still has `entityId: null` in their cookie. Rather than
 * force a re-login, fall back to the database (app_users.entity_id, then
 * entities.created_by) so downstream screens work immediately.
 */
export async function resolveEntityId(session: SessionPayload | null): Promise<string | null> {
  if (!session) return null;
  if (session.entityId) return session.entityId;
  if (session.role !== 'PE') return null;
  try {
    const { data: user } = await db().from('app_users').select('entity_id').eq('id', session.uid).maybeSingle();
    if (user?.entity_id) return user.entity_id as string;
    const { data: entity } = await db().from('entities').select('id').eq('created_by', session.uid).order('created_at', { ascending: true }).limit(1).maybeSingle();
    return (entity?.id as string) ?? null;
  } catch {
    return null;
  }
}

/** Landing route for a role after login. */
export function homeForRole(role: Role): string {
  switch (role) {
    case 'PE': return '/pe';
    case 'ADMIN': return '/admin';
    default: return '/operator';
  }
}
