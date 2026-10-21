import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { json, badRequest } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { contactMatches, hoursUntil, isOverdue, maskContact } from '@/lib/grievance';
import { signedGrievanceUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Public tracking — requires the grievance ID plus the contact used to file it. */
export async function GET(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`grievance-track:${ip}`, { max: 30, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) return json({ ok: false, error: 'Too many lookups. Please wait a moment.' }, 429);

  const code = (req.nextUrl.searchParams.get('grievanceId') ?? '').trim().toUpperCase();
  const contact = (req.nextUrl.searchParams.get('contact') ?? '').trim();
  if (!code || !contact) return badRequest('Enter your grievance ID and the mobile number or e-mail you filed with.');

  const { data: g } = await db().from('grievances').select('*').eq('grievance_code', code).maybeSingle();
  // Same answer for "not found" and "wrong contact" so IDs cannot be probed.
  if (!g || !contactMatches(contact, g)) {
    return json({ ok: false, error: 'No grievance found for that ID and contact.' }, 404);
  }

  let enterprise: string | null = null;
  if (g.entity_id) {
    const { data: e } = await db().from('entities').select('legal_entity_name').eq('id', g.entity_id).maybeSingle();
    enterprise = (e?.legal_entity_name as string) ?? null;
  }

  const attachmentUrl = g.attachment_path ? await signedGrievanceUrl(g.attachment_path, 300) : null;

  const timeline = [
    { at: g.created_at, label: 'Grievance received', done: true },
    { at: g.acknowledged_at, label: 'Acknowledged by the enterprise', done: Boolean(g.acknowledged_at) },
    { at: g.resolved_at, label: g.status === 'REJECTED' ? 'Closed by the enterprise' : 'Resolved', done: Boolean(g.resolved_at) },
  ];

  return json({
    ok: true,
    grievance: {
      grievance_code: g.grievance_code,
      status: g.status,
      category: g.category,
      reported_header: g.reported_header,
      message_content: g.message_content,
      highlighted_url: g.highlighted_url,
      highlighted_phone: g.highlighted_phone,
      created_at: g.created_at,
      sla_due_at: g.sla_due_at,
      acknowledged_at: g.acknowledged_at,
      resolved_at: g.resolved_at,
      resolution_remarks: g.resolution_remarks,
      enterprise,
      matched: Boolean(g.entity_id),
      overdue: isOverdue(g.status, g.sla_due_at),
      hours_remaining: hoursUntil(g.sla_due_at),
      reporter: maskContact(g.subscriber_email || g.subscriber_mobile),
      attachment_url: attachmentUrl,
      attachment_name: g.attachment_name,
      timeline,
    },
  });
}
