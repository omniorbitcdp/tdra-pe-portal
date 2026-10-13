import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId, setSessionCookie } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { entityDetailsSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import type { Entity } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return json({ ok: true, entity: null });
  const { data } = await db().from('entities').select('*').eq('id', entityId).maybeSingle();
  return json({ ok: true, entity: data });
}

/** Create (first save) or update the PE entity profile. */
export async function PUT(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = entityDetailsSchema.safeParse(body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    const values = { ...parsed.data, created_by: s!.uid };
    const entityId = await resolveEntityId(s);

    if (!entityId) {
      const { data: created, error } = await db()
        .from('entities').insert({ ...values, kyc_status: 'DRAFT' }).select('*').single<Entity>();
      if (error) return badRequest(error.message);
      await db().from('app_users').update({ entity_id: created.id }).eq('id', s!.uid);
      // Re-issue the session so the new entityId is carried straight away —
      // otherwise the dashboard / KYC screens would still see a null entity.
      await setSessionCookie({ ...s!, entityId: created.id });
      await logAudit({ entity_id: created.id, module: 'KYC', record_id: created.id, action: 'CREATE', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: 'DRAFT', remarks: 'Entity profile created' });
      return json({ ok: true, entity: created, entity_id: created.id });
    }

    const { data: updated, error } = await db()
      .from('entities').update(values).eq('id', entityId).select('*').single<Entity>();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'KYC', record_id: entityId, action: 'UPDATE', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: null, remarks: 'Entity details updated' });
    return json({ ok: true, entity: updated });
  } catch (e) { return serverError(e); }
}
