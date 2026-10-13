// Lightweight in-memory sliding-window rate limiter (§11).
// NOTE: state is per server instance. On serverless/multi-instance hosting this
// is a best-effort first line of defence — pair it with the platform's WAF /
// Upstash-Redis adapter for a globally consistent limit.
type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max requests allowed inside the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, opts: RateLimitOptions, now = Date.now()): RateLimitResult {
  const { max, windowMs } = opts;
  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: max - bucket.hits.length, retryAfterSeconds: 0 };
}

export function resetRateLimit(key?: string): void {
  if (key) buckets.delete(key);
  else buckets.clear();
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
