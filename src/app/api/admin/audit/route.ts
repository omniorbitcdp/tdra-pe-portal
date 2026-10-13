import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const module = req.nextUrl.searchParams.get('module');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '200'), 1000);
  let query = db().from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (module) query = query.eq('module', module);
  const { data } = await query;
  return json({ ok: true, audit: data ?? [] });
}
