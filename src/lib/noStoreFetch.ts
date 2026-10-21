/**
 * Supabase issues a GET to PostgREST for every `.select()`. Next.js patches the
 * global fetch on the server and would cache those GETs in its Data Cache, so a
 * row updated by another request kept being served from an old snapshot — this
 * is why an ACKNOWLEDGED grievance still showed as SUBMITTED on the tracking
 * page. Every database read must bypass that cache.
 */
export function noStoreFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, cache: 'no-store' });
}
