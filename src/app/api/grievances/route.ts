import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { json, badRequest, serverError } from '@/lib/http';
import { grievanceSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import { getSettings } from '@/lib/settings';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { allocateGrievanceCode, resolveGrievanceHeader, slaDueFrom } from '@/lib/grievance';
import { GRIEVANCE_ALLOWED_MIME, grievanceStoragePath, uploadGrievanceFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public endpoint — a subscriber with no account reports an SMS. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`grievance:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return json({ ok: false, error: `Too many submissions. Try again in ${rl.retryAfterSeconds}s.` }, 429);

  try {
    const contentType = req.headers.get('content-type') ?? '';
    const payload: Record<string, unknown> = {};
    let file: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const fd = await req.formData();
      for (const [k, v] of Array.from(fd.entries())) if (typeof v === 'string') payload[k] = v;
      const f = fd.get('attachment');
      if (f && typeof f === 'object' && 'arrayBuffer' in f) file = f as File;
    } else {
      Object.assign(payload, await req.json().catch(() => ({})));
    }

    const parsed = grievanceSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    const d = parsed.data;

    const settings = await getSettings();

    // ---- optional screenshot -------------------------------------------------
    let attachment: { path: string; name: string; mime: string; size: number } | null = null;
    if (file && file.size > 0) {
      const mime = file.type || 'application/octet-stream';
      if (!GRIEVANCE_ALLOWED_MIME.includes(mime)) {
        return badRequest('Unsupported file type. Attach a JPG, PNG, WEBP or PDF.', { errors: { attachment: 'Unsupported file type.' } });
      }
      if (file.size > settings.maxGrievanceFileMb * 1024 * 1024) {
        return badRequest(`The screenshot must be under ${settings.maxGrievanceFileMb} MB.`, { errors: { attachment: 'File too large.' } });
      }
      const path = grievanceStoragePath(file.name);
      await uploadGrievanceFile(path, await file.arrayBuffer(), mime);
      attachment = { path, name: file.name, mime, size: file.size };
    }

    // ---- match to a Principal Entity, on the header alone --------------------
    const { match, entityId, entityName } = await resolveGrievanceHeader(d.reported_header);

    const now = new Date();
    const grievanceCode = await allocateGrievanceCode();
    const { data: created, error } = await db().from('grievances').insert({
      grievance_code: grievanceCode,
      reported_header: d.reported_header,
      header_id: match.header?.id ?? null,
      entity_id: entityId,
      message_content: d.message_content,
      highlighted_url: d.highlighted_url || null,
      highlighted_phone: d.highlighted_phone || null,
      category: d.category,
      description: d.description || null,
      subscriber_name: d.subscriber_name || null,
      subscriber_email: d.subscriber_email || null,
      subscriber_mobile: d.subscriber_mobile,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
      status: 'SUBMITTED',
      sla_due_at: slaDueFrom(now, settings.grievanceSlaHours).toISOString(),
      match_method: match.method,
    }).select('*').single();
    if (error) return badRequest(error.message);

    await logAudit({
      entity_id: entityId, module: 'GRIEVANCE', record_id: created.id, action: 'SUBMIT',
      actor_id: null, actor_email: d.subscriber_email || null, actor_name: d.subscriber_name || null,
      actor_role: 'SUBSCRIBER', from_status: null, to_status: 'SUBMITTED',
      remarks: `${created.grievance_code ?? ''} header="${d.reported_header}" match=${match.method}`.trim(),
    });

    // ---- notify the enterprise and every administrator ----------------------
    const subject = `Grievance ${created.grievance_code ?? ''} — ${d.category}`;
    const body = `A subscriber reported an SMS from "${d.reported_header}". Grievance ${created.grievance_code ?? ''} is awaiting your action.`;
    if (entityId) {
      const { data: entity } = await db().from('entities').select('official_email').eq('id', entityId).maybeSingle();
      const to = (entity?.official_email as string) || null;
      if (to) await sendNotification({ event: 'GRIEVANCE_SUBMITTED', channel: 'EMAIL', recipient: to, vars: { recipient: to, subject, body } }).catch(() => undefined);
    }
    const { data: admins } = await db().from('app_users').select('email,role,status').eq('role', 'ADMIN');
    for (const a of admins ?? []) {
      if ((a as { status?: string }).status === 'ACTIVE' && (a as { email?: string }).email) {
        const to = (a as { email: string }).email;
        await sendNotification({ event: 'GRIEVANCE_SUBMITTED', channel: 'EMAIL', recipient: to, vars: { recipient: to, subject: `[Admin] ${subject}`, body } }).catch(() => undefined);
      }
    }

    return json({
      ok: true,
      grievance: {
        id: created.id,
        grievance_code: created.grievance_code,
        status: created.status,
        sla_due_at: created.sla_due_at,
        category: created.category,
        reported_header: created.reported_header,
        highlighted_url: created.highlighted_url,
        highlighted_phone: created.highlighted_phone,
        attachment: attachment ? { name: attachment.name } : null,
      },
      matched: Boolean(entityId),
      enterprise: entityName,
    });
  } catch (e) { return serverError(e); }
}
