import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard, resolveEntityId } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { canCreateHeader, canCreateTemplate, canCreateUrl, type GateResult } from '@/lib/workflow';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import type { Entity, HeaderRegistration, TemplateRegistration, UrlRegistration } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TABLES: Record<string, string> = { HEADER: 'header_registrations', TEMPLATE: 'template_registrations', URL: 'url_registrations' };

/** Submit a DRAFT registration for review. Enforces the KYC -> Header ->
 *  Template -> URL sequence server-side (§6, §12). */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['PE']); if (g) return g;
  if (!(await resolveEntityId(s))) return badRequest('No entity profile linked to this account.');
  try {
    const { module, id } = await req.json().catch(() => ({}));
    if (!TABLES[module]) return badRequest('Invalid module.');
    const table = TABLES[module];
    const { data: record } = await db().from(table).select('*').eq('id', id).eq('entity_id', (await resolveEntityId(s))).maybeSingle();
    if (!record) return notFound('Record not found.');
    if (record.status !== 'DRAFT' && record.status !== 'CLARIFICATION_REQUIRED' && record.status !== 'REJECTED') {
      return json({ ok: false, error: `Cannot submit a record in status ${record.status}.` }, 409);
    }
    const { data: entity } = await db().from('entities').select('*').eq('id', (await resolveEntityId(s))).maybeSingle<Entity>();

    let gate: GateResult = { ok: true };
    if (module === 'HEADER') gate = canCreateHeader(entity);
    if (module === 'TEMPLATE') {
      const { data: header } = await db().from('header_registrations').select('*').eq('id', (record as TemplateRegistration).header_id).maybeSingle<HeaderRegistration>();
      gate = canCreateTemplate(entity, header);
    }
    if (module === 'URL') {
      const { data: tpl } = await db().from('template_registrations').select('*').eq('id', (record as UrlRegistration).template_id).maybeSingle<TemplateRegistration>();
      gate = canCreateUrl(entity, tpl);
    }
    if (!gate.ok) return json({ ok: false, error: gate.reason }, 409);

    const from = record.status;
    const to = from === 'DRAFT' ? 'SUBMITTED' : 'RESUBMITTED';
    // Reference code is surfaced in the audit trail for traceability.
    const code = (record.header_code ?? record.template_code ?? record.url_code ?? '') as string;
    const { data: updated, error } = await db().from(table).update({ status: to, submitted_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: (await resolveEntityId(s)), module, record_id: id, action: 'SUBMIT', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: from, to_status: to, remarks: code || null });
    await sendNotification({ event: `${module}_SUBMITTED`, channel: 'EMAIL', recipient: entity?.official_email ?? s!.email, vars: { recipient: entity?.official_email ?? s!.email, subject: `${module} request submitted`, body: `Your ${module.toLowerCase()} registration has been submitted and is pending review.` } }).catch(() => undefined);
    return json({ ok: true, record: updated });
  } catch (e) { return serverError(e); }
}
