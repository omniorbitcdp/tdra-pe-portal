// Minimal stand-in for next/server so route handlers can be invoked directly
// in Vitest (node env). Only the surface the app actually uses.
export interface StubResponse {
  status: number;
  _data: unknown;
  json(): Promise<unknown>;
  headers: { get(k: string): string | null };
}

function make(status: number, data: unknown, headers: Record<string, string> = {}): StubResponse {
  return {
    status,
    _data: data,
    async json() { return data; },
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  };
}

export const NextResponse = {
  json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return make(init?.status ?? 200, data, init?.headers ?? {});
  },
  redirect(url: { toString(): string }) {
    return make(307, null, { location: url.toString() });
  },
  next() {
    return make(200, null, { 'x-middleware-next': '1' });
  },
};

export class NextRequest {
  constructor(public url: string, public init?: RequestInit) {}
}
