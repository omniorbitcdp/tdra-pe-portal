import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { hashPassword, passwordPolicyErrors } from '@/lib/password';
import { ACCOUNT_STATUSES, ROLES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Update a user: status (activate/lock/disable), role, or reset password. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const { data: user } = await db().from('app_users').select('*').eq('id', params.id).maybeSingle();
    if (!user) return notFound('User not found.');
    const patch: Record<string, unknown> = {};
    if (body.status) {
      if (!ACCOUNT_STATUSES.includes(body.status)) return badRequest('Invalid status.');
      patch.status = body.status;
      if (body.status === 'ACTIVE') { patch.locked_until = null; patch.failed_login_attempts = 0; }
    }
    if (body.role) {
      if (!ROLES.includes(body.role)) return badRequest('Invalid role.');
      patch.role = body.role;
    }
    if (body.password) {
      const policy = passwordPolicyErrors(String(body.password));
      if (policy.length) return badRequest('Password does not meet policy', { errors: { password: policy.join('. ') } });
      patch.password_hash = await hashPassword(String(body.password));
      patch.password_changed_at = new Date().toISOString();
      patch.status = body.status ?? 'ACTIVE';
      patch.locked_until = null;
      patch.failed_login_attempts = 0;
    }
    if (!Object.keys(patch).length) return badRequest('Nothing to update.');
    const { data: updated, error } = await db().from('app_users').update(patch).eq('id', params.id)
      .select('id,email,full_name,role,entity_id,status').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: user.entity_id, module: 'ACCOUNT', record_id: user.id, action: 'ADMIN_UPDATE_USER', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: user.status, to_status: updated.status, remarks: Object.keys(patch).join(', ') });
    return json({ ok: true, user: updated });
  } catch (e) { return serverError(e); }
}
