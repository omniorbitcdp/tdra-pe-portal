import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { urlSchema } from '@/lib/validation';
import { canCreateUrl } from '@/lib/workflow';
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
