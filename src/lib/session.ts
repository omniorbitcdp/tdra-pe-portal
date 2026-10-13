// Session token creation/verification (jose HS256). Pure functions so they can
// be unit-tested without a running server.
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from './constants';

export interface SessionPayload {
  uid: string;
  email: string;
  role: Role;
  entityId: string | null;
  name?: string;
}

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET || 'dev-only-secret-change-me-please-32-characters';
  return new TextEncoder().encode(s);
}

export async function createSessionToken(payload: SessionPayload, ttlHours = 12): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload || typeof payload.uid !== 'string' || typeof payload.role !== 'string') return null;
    return {
      uid: payload.uid as string,
      email: (payload.email as string) ?? '',
      role: payload.role as Role,
      entityId: (payload.entityId as string | null) ?? null,
      name: payload.name as string | undefined,
    };
  } catch {
    return null;
  }
}
