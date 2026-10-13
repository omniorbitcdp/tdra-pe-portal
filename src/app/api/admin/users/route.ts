import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { hashPassword, passwordPolicyErrors } from '@/lib/password';
import { ROLES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const { data } = await db().from('app_users').select('id,email,full_name,phone,role,entity_id,status,last_login_at,created_at').order('created_at', { ascending: false });
  return json({ ok: true, users: data ?? [] });
}

/** Admin creates operator/admin/PE users directly (operator users cannot self-register). */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const role = String(body.role ?? '');
    if (!email.includes('@')) return badRequest('Enter a valid email.');
    if (!ROLES.includes(role as never)) return badRequest('Invalid role.');
    const policy = passwordPolicyErrors(password);
    if (policy.length) return badRequest('Password does not meet policy', { errors: { password: policy.join('. ') } });
    const { data: existing } = await db().from('app_users').select('id').eq('email', email).maybeSingle();
    if (existing) return badRequest('A user with this email already exists.');
    const password_hash = await hashPassword(password);
    const { data: created, error } = await db().from('app_users').insert({
      email, password_hash, full_name: body.full_name ?? null, phone: body.phone ?? null,
      role, entity_id: body.entity_id ?? null, status: 'ACTIVE', password_changed_at: new Date().toISOString(),
    }).select('id,email,full_name,role,entity_id,status,created_at').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: created.entity_id, module: 'ACCOUNT', record_id: created.id, action: 'ADMIN_CREATE_USER', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: 'ACTIVE', remarks: role });
    return json({ ok: true, user: created });
  } catch (e) { return serverError(e); }
}
