'use client';
// Browser-side fetch helper with JSON + error normalisation, plus a short-lived
// GET cache.
//
// Why the cache: screens re-mount for reasons that have nothing to do with the
// data — switching language (the tree is re-keyed so every string re-renders) is
// the common one. Without a cache each re-mount threw away the list and re-fetched
// it, so the page flashed a spinner and the switch felt slow. Serving the last
// response for a few seconds makes the re-mount paint instantly; a mutation
// clears the cache so nothing stale survives an action.
export interface ApiError { error: string; errors?: Record<string, string> }
export interface ApiResult<T> { ok: boolean; status: number; data: T & ApiError }

/** How long a GET response may be reused before it must be re-fetched. */
const TTL_MS = Number(process.env.NEXT_PUBLIC_API_CACHE_MS ?? '15000');

const cache = new Map<string, { at: number; result: ApiResult<Record<string, unknown>> }>();
const inflight = new Map<string, Promise<ApiResult<Record<string, unknown>>>>();

/** Drop cached GETs — all of them, or those whose path starts with `prefix`. */
export function invalidateApi(prefix?: string): void {
  if (!prefix) { cache.clear(); return; }
  for (const key of Array.from(cache.keys())) if (key.startsWith(prefix)) cache.delete(key);
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    cache: 'no-store',
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

export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const cacheable = method === 'GET' && !init?.body;

  if (!cacheable) {
    const result = await request<T>(path, init);
    // Any write may change any list, badge or counter on the page.
    invalidateApi();
    return result;
  }

  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result as ApiResult<T>;

  // Collapse duplicate concurrent GETs (two panels loading the same list).
  const pending = inflight.get(path);
  if (pending) return pending as Promise<ApiResult<T>>;

  const p = request<T>(path, init)
    .then((result) => {
      if (result.ok) cache.set(path, { at: Date.now(), result: result as ApiResult<Record<string, unknown>> });
      return result;
    })
    .finally(() => { inflight.delete(path); });

  inflight.set(path, p as Promise<ApiResult<Record<string, unknown>>>);
  return p;
}

export async function apiForm<T = Record<string, unknown>>(path: string, form: FormData): Promise<ApiResult<T>> {
  const res = await fetch(path, { method: 'POST', body: form });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty body */ }
  const payload = data as unknown as T & ApiError;
  if (payload && typeof payload === 'object' && typeof payload.error !== 'string') {
    (payload as { error: string }).error = res.ok ? '' : `Request failed (HTTP ${res.status})`;
  }
  invalidateApi();
  return { ok: res.ok && (data as { ok?: boolean }).ok !== false, status: res.status, data: payload };
}
