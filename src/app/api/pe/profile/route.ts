import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { entityDetailsSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  if (!s!.entityId) return json({ ok: true, entity: null });
  const { data } = await db().from('entities').select('*').eq('id', s!.entityId).maybeSingle();
  return json({ ok: true, entity: data });
}

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

    if (!s!.entityId) {
      const { data: created, error } = await db().from('entities').insert({ ...values, kyc_status: 'DRAFT' }).select('*').single();
      if (error) return badRequest(error.message);
      await db().from('app_users').update({ entity_id: created.id }).eq('id', s!.uid);
      await logAudit({ entity_id: created.id, module: 'KYC', record_id: created.id, action: 'CREATE', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: 'DRAFT', remarks: 'Entity profile created' });
      return json({ ok: true, entity: created, entity_id: created.id });
    }

    const { data: updated, error } = await db().from('entities').update(values).eq('id', s!.entityId).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: s!.entityId, module: 'KYC', record_id: s!.entityId, action: 'UPDATE', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: null, remarks: 'Entity details updated' });
    return json({ ok: true, entity: updated });
  } catch (e) { return serverError(e); }
}
