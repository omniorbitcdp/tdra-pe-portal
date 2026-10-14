import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { templateSchema } from '@/lib/validation';
import { canCreateTemplate } from '@/lib/workflow';
import { logAudit } from '@/lib/audit';
import { extractVariables, normaliseSamples } from '@/lib/templateVars';
import type { Entity, HeaderRegistration, TemplateRegistration } from '@/lib/types';

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

/** SMS templates only. Variables are declared inline as <var1>, <var2> … and
 *  every declared variable must carry sample content. */
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

    const declared = extractVariables(parsed.data.body);
    const { data, error } = await db().from('template_registrations')
      .insert({
        ...parsed.data,
        channel: 'SMS',
        variables: declared.join(','),
        variable_samples: normaliseSamples(parsed.data.body, parsed.data.variable_samples),
        entity_id: entityId, status: 'DRAFT', created_by: s!.uid,
      }).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'TEMPLATE', record_id: data.id, action: 'CREATE', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: 'DRAFT', remarks: `${data.template_code ?? ''} ${parsed.data.template_name}`.trim() });
    return json({ ok: true, template: data });
  } catch (e) { return serverError(e); }
}

/** Define or amend the sample content of a template that is still editable. */
export async function PATCH(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  const entityId = await resolveEntityId(s);
  if (!entityId) return badRequest('Complete your KYC profile first.');
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return badRequest('id is required.');
    const { data: existing } = await db().from('template_registrations').select('*')
      .eq('id', id).eq('entity_id', entityId).maybeSingle<TemplateRegistration>();
    if (!existing) return notFound('Template not found.');
    if (['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'APPROVED'].includes(existing.status)) {
      return json({ ok: false, error: 'Sample content cannot be changed while the template is under review or approved.' }, 409);
    }
    const declared = extractVariables(existing.body);
    const samples = normaliseSamples(existing.body, (body.variable_samples ?? {}) as Record<string, string>);
    const missing = declared.filter((v) => !(samples[v] ?? '').trim());
    if (missing.length) {
      return badRequest('Validation failed', { errors: { [`variable_samples.${missing[0]}`]: `Sample content is required for <${missing[0]}>` } });
    }
    const { data, error } = await db().from('template_registrations')
      .update({ variable_samples: samples, variables: declared.join(',') }).eq('id', id).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: entityId, module: 'TEMPLATE', record_id: id, action: 'UPDATE_SAMPLES', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: existing.status, to_status: existing.status, remarks: declared.map((v) => `<${v}>`).join(' ') });
    return json({ ok: true, template: data });
  } catch (e) { return serverError(e); }
}
