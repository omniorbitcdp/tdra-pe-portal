import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { urlSchema } from '@/lib/validation';
import { canCreateUrl } from '@/lib/workflow';
import { isEditable, statusLockLabel } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import type { Entity, TemplateRegistration } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return json({ ok: true, urls: [] });
  const { data } = await db().from('url_registrations').select('*')
    .eq('entity_id', entityId).order('created_at', { ascending: false }).limit(100);
  return json({ ok: true, urls: data ?? [] });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Complete your KYC profile first.');
  try {
    const parsed = urlSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    const [{ data: entity }, { data: tpl }] = await Promise.all([
      db().from('entities').select('*').eq('id', entityId).maybeSingle<Entity>(),
      db().from('template_registrations').select('*').eq('id', parsed.data.template_id).eq('entity_id', entityId).maybeSingle<TemplateRegistration>(),
    ]);
    const gate = canCreateUrl(entity, tpl);
    if (!gate.ok) return json({ ok: false, error: gate.reason }, 409);

    const { data, error } = await db().from('url_registrations')
      .insert({ ...parsed.data, entity_id: entityId, status: 'DRAFT', created_by: s!.uid }).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'URL', record_id: data.id, action: 'CREATE', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: 'DRAFT', remarks: `${data.url_code ?? ''} ${parsed.data.url}`.trim() });
    return json({ ok: true, url: data });
  } catch (e) { return serverError(e); }
}

/** Amend a URL the enterprise still owns the correction for. */
export async function PUT(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Complete your KYC profile first.');
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return badRequest('id is required.');
    const { data: existing } = await db().from('url_registrations').select('*')
      .eq('id', id).eq('entity_id', entityId).maybeSingle();
    if (!existing) return notFound('URL not found.');
    if (!isEditable(existing.status)) {
      return json({ ok: false, error: `This URL is ${statusLockLabel(existing.status)} and can no longer be edited.` }, 409);
    }
    const parsed = urlSchema.safeParse({ ...body, template_id: body.template_id ?? existing.template_id });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    // A re-pointed URL must still hang off an APPROVED template of this entity.
    const { data: tpl } = await db().from('template_registrations').select('*')
      .eq('id', parsed.data.template_id).eq('entity_id', entityId).maybeSingle<TemplateRegistration>();
    if (!tpl || tpl.status !== 'APPROVED') {
      return json({ ok: false, error: 'The selected template must be APPROVED.' }, 409);
    }
    const { data, error } = await db().from('url_registrations')
      .update(parsed.data).eq('id', id).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'URL', record_id: id, action: 'UPDATE', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: existing.status, to_status: existing.status, remarks: `${data.url_code ?? ''} ${parsed.data.url}`.trim() });
    return json({ ok: true, url: data });
  } catch (e) { return serverError(e); }
}
