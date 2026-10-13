import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { templateSchema } from '@/lib/validation';
import { canCreateTemplate } from '@/lib/workflow';
import { logAudit } from '@/lib/audit';
import type { Entity, HeaderRegistration } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return json({ ok: true, templates: [] });
  const { data } = await db().from('template_registrations').select('*')
    .eq('entity_id', entityId).order('created_at', { ascending: false }).limit(100);
  return json({ ok: true, templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Complete your KYC profile first.');
  try {
    const parsed = templateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    const [{ data: entity }, { data: header }] = await Promise.all([
      db().from('entities').select('*').eq('id', entityId).maybeSingle<Entity>(),
      db().from('header_registrations').select('*').eq('id', parsed.data.header_id).eq('entity_id', entityId).maybeSingle<HeaderRegistration>(),
    ]);
    const gate = canCreateTemplate(entity, header);
    if (!gate.ok) return json({ ok: false, error: gate.reason }, 409);

    const { data, error } = await db().from('template_registrations')
      .insert({ ...parsed.data, entity_id: entityId, status: 'DRAFT', created_by: s!.uid }).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'TEMPLATE', record_id: data.id, action: 'CREATE', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: 'DRAFT', remarks: `${data.template_code ?? ''} ${parsed.data.template_name}`.trim() });
    return json({ ok: true, template: data });
  } catch (e) { return serverError(e); }
}
