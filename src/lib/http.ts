// Small helpers for JSON API responses with no-store cache headers.
import { NextResponse } from 'next/server';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return json({ ok: false, error: message, ...extra }, 400);
}

export function unauthorized(message = 'Authentication required') {
  return json({ ok: false, error: message }, 401);
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return json({ ok: false, error: message }, 403);
}

export function notFound(message = 'Not found') {
  return json({ ok: false, error: message }, 404);
}

export function serverError(e: unknown) {
  const message = e instanceof Error ? e.message : 'Unexpected server error';
  return json({ ok: false, error: message }, 500);
}

/** Zod-ish error flattening for a compact API payload. */
export function validationError(issues: Array<{ path: (string | number)[]; message: string }>) {
  const errors: Record<string, string> = {};
  for (const i of issues) errors[i.path.join('.') || '_'] = i.message;
  return json({ ok: false, error: 'Validation failed', errors }, 422);
}
