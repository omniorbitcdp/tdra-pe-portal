import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { headerSchema } from '@/lib/validation';
import { canCreateHeader } from '@/lib/workflow';
import { isEditable, statusLockLabel } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import type { Entity } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return json({ ok: true, headers: [] });
  const { data } = await db().from('header_registrations').select('*')
    .eq('entity_id', entityId).order('created_at', { ascending: false }).limit(100);
  return json({ ok: true, headers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Complete your KYC profile first.');
  try {
    const { data: entity } = await db().from('entities').select('*').eq('id', entityId).maybeSingle<Entity>();
    const gate = canCreateHeader(entity);
    if (!gate.ok) return json({ ok: false, error: gate.reason }, 409);

    const parsed = headerSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    const { data, error } = await db().from('header_registrations')
      .insert({ ...parsed.data, entity_id: entityId, status: 'DRAFT', created_by: s!.uid }).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'HEADER', record_id: data.id, action: 'CREATE', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: 'DRAFT', remarks: `${data.header_code ?? ''} ${parsed.data.header_name}`.trim() });
    return json({ ok: true, header: data });
  } catch (e) { return serverError(e); }
}

/** Amend a header the enterprise still owns the correction for. A record under
 *  review or already approved is frozen (409). */
export async function PUT(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Complete your KYC profile first.');
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return badRequest('id is required.');
    const { data: existing } = await db().from('header_registrations').select('*')
      .eq('id', id).eq('entity_id', entityId).maybeSingle();
    if (!existing) return notFound('Header not found.');
    if (!isEditable(existing.status)) {
      return json({ ok: false, error: `This header is ${statusLockLabel(existing.status)} and can no longer be edited.` }, 409);
    }
    const parsed = headerSchema.safeParse(body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    const { data, error } = await db().from('header_registrations')
      .update(parsed.data).eq('id', id).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'HEADER', record_id: id, action: 'UPDATE', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: existing.status, to_status: existing.status, remarks: `${data.header_code ?? ''} ${parsed.data.header_name}`.trim() });
    return json({ ok: true, header: data });
  } catch (e) { return serverError(e); }
}
