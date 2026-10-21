// Server-only Supabase client. Uses the SERVICE ROLE key and is only ever
// imported by API route handlers / server components — never client code.
// RBAC is enforced in code (see auth.ts) in addition to deny-all RLS.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { noStoreFetch } from './noStoreFetch';

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Every PostgREST read is a GET; Next.js would otherwise serve it from its
      // Data Cache and hand back stale rows (see noStoreFetch).
      global: { fetch: noStoreFetch },
    });
  }
  return cached;
}

export { noStoreFetch };
