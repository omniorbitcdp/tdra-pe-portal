/**
 * Regression: the tracking page showed SUBMITTED long after the enterprise had
 * acknowledged. Supabase reads PostgREST over GET, and Next.js caches server
 * GETs unless told otherwise — every database read must bypass that cache.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { noStoreFetch } from '@/lib/noStoreFetch';
import { freshDb, signInAs, makeRequest } from './helpers/harness';
import * as grievances from '@/app/api/grievances/route';
import * as track from '@/app/api/grievances/track/route';
import * as peGrievances from '@/app/api/pe/grievances/route';

const status = (r: unknown) => (r as { status: number }).status;
const body = (r: unknown) => (r as { _data: any })._data;

describe('database reads bypass the Next.js data cache', () => {
  const stubFetch = () => {
    const orig = globalThis.fetch;
    const seen: RequestInit[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response('{}');
    }) as typeof fetch;
    return { seen, restore: () => { globalThis.fetch = orig; } };
  };

  it('noStoreFetch forces cache: no-store', async () => {
    const f = stubFetch();
    try {
      await noStoreFetch('https://example.test/rest/v1/grievances');
      expect(f.seen).toHaveLength(1);
      expect(f.seen[0].cache).toBe('no-store');
    } finally { f.restore(); }
  });

  it('keeps the caller\'s other options intact', async () => {
    const f = stubFetch();
    try {
      await noStoreFetch('https://example.test/x', { method: 'PATCH', body: '{}' });
      expect(f.seen[0].method).toBe('PATCH');
      expect(f.seen[0].cache).toBe('no-store');
    } finally { f.restore(); }
  });
});

describe('an acknowledgement is visible to the subscriber immediately', () => {
  beforeEach(async () => {
    freshDb();
    await signInAs(null);
    await grievances.POST(makeRequest('/api/grievances', {
      body: {
        reported_header: 'ALPHA', message_content: 'You have won a prize, click now',
        category: 'FRAUD', subscriber_mobile: '+971501234567',
      },
    }) as never);
  });

  it('shows SUBMITTED, then ACKNOWLEDGED after the enterprise acts', async () => {
    const { data: row } = await (await import('@/lib/db')).db()
      .from('grievances').select('*').eq('reported_header', 'ALPHA').maybeSingle();
    const id = (row as { id: string }).id;
    const code = (row as { grievance_code: string }).grievance_code;

    await signInAs(null);
    const before = body(await track.GET(makeRequest(
      `/api/grievances/track?grievanceId=${code}&contact=%2B971501234567`) as never)).grievance;
    expect(before.status).toBe('SUBMITTED');
    expect(before.timeline[1].done).toBe(false);

    await signInAs('peA');
    const ack = await peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id, action: 'ACKNOWLEDGE' } }) as never);
    expect(status(ack)).toBe(200);

    await signInAs(null);
    const after = body(await track.GET(makeRequest(
      `/api/grievances/track?grievanceId=${code}&contact=%2B971501234567`) as never)).grievance;
    expect(after.status).toBe('ACKNOWLEDGED');
    expect(after.timeline[1].done).toBe(true);
    expect(after.acknowledged_at).toBeTruthy();
  });

  it('a single-step resolve still ticks the acknowledgement stage', async () => {
    const { data: row } = await (await import('@/lib/db')).db()
      .from('grievances').select('*').eq('reported_header', 'ALPHA').maybeSingle();
    const id = (row as { id: string }).id;
    const code = (row as { grievance_code: string }).grievance_code;

    await signInAs('peA');
    await peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id, action: 'RESOLVE', remarks: 'Blocked the sender.' } }) as never);

    await signInAs(null);
    const t = body(await track.GET(makeRequest(
      `/api/grievances/track?grievanceId=${code}&contact=%2B971501234567`) as never)).grievance;
    expect(t.status).toBe('RESOLVED');
    expect(t.timeline.every((x: { done: boolean }) => x.done)).toBe(true);
  });
});
