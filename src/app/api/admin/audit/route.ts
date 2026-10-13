import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Audit trail with filters — answers "who approved what, and when" (§7.1, §11). */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;

  const q = req.nextUrl.searchParams;
  const module = q.get('module');
  const action = q.get('action');
  const actor = q.get('actor');          // matches name OR email
  const decisionOnly = q.get('decisions') === '1';
  const from = q.get('from');
  const to = q.get('to');
  const limit = Math.min(Number(q.get('limit') ?? '200'), 1000);

  let query = db().from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (module) query = query.eq('module', module);
  if (action) query = query.eq('action', action);
  if (decisionOnly) query = query.in('action', ['APPROVE', 'REJECT', 'REQUEST_CORRECTION', 'VERIFY_DOCUMENT', 'APPROVE_INFO', 'REVOKE_INFO']);
  if (from) query = query.gte('created_at', new Date(from).toISOString());
  if (to) query = query.lte('created_at', new Date(`${to}T23:59:59`).toISOString());
  if (actor) {
    const safe = actor.replace(/[%,]/g, '');
    query = query.or(`actor_name.ilike.%${safe}%,actor_email.ilike.%${safe}%`);
  }

  const { data } = await query;

  const DISTINCT_ACTIONS = ['CREATE', 'SUBMIT', 'APPROVE', 'REJECT', 'REQUEST_CORRECTION', 'START_REVIEW',
    'VERIFY_DOCUMENT', 'UPLOAD', 'REPLACE', 'APPROVE_INFO', 'REVOKE_INFO', 'CREATE_PROVIDER', 'UPDATE_PROVIDER',
    'DELETE_PROVIDER', 'TEST_PROVIDER', 'UPDATE_SETTINGS', 'ADMIN_CREATE_USER', 'ADMIN_UPDATE_USER',
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_RESET', 'VIEW', 'UPDATE'];

  return json({ ok: true, audit: data ?? [], actions: DISTINCT_ACTIONS });
}
