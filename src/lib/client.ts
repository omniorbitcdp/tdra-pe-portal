'use client';
// Browser-side fetch helper with JSON + error normalisation.
export interface ApiError { error: string; errors?: Record<string, string> }
export interface ApiResult<T> { ok: boolean; status: number; data: T & ApiError }

export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty body */ }
  const payload = data as unknown as T & ApiError;
  if (payload && typeof payload === 'object' && typeof payload.error !== 'string') {
    (payload as { error: string }).error = res.ok ? '' : `Request failed (HTTP ${res.status})`;
  }
  return { ok: res.ok && (data as { ok?: boolean }).ok !== false, status: res.status, data: payload };
}

export async function apiForm<T = Record<string, unknown>>(path: string, form: FormData): Promise<ApiResult<T>> {
  const res = await fetch(path, { method: 'POST', body: form });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty body */ }
  const payload = data as unknown as T & ApiError;
  if (payload && typeof payload === 'object' && typeof payload.error !== 'string') {
    (payload as { error: string }).error = res.ok ? '' : `Request failed (HTTP ${res.status})`;
  }
  return { ok: res.ok && (data as { ok?: boolean }).ok !== false, status: res.status, data: payload };
}
