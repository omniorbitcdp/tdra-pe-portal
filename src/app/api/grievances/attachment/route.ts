import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, resolveEntityId } from '@/lib/auth';
import { json, badRequest, forbidden, notFound } from '@/lib/http';
import { contactMatches } from '@/lib/grievance';
import { signedGrievanceUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Signed, short-lived URL for the screenshot. Reachable by the owning
 *  enterprise, an administrator, or the reporter who supplies ID + contact. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!id) return badRequest('id is required.');
  const { data: g } = await db().from('grievances').select('*').eq('id', id).maybeSingle();
  if (!g) return notFound('Grievance not found.');
  if (!g.attachment_path) return notFound('This grievance has no attachment.');

  const s = await getSession();
  let allowed = false;
  if (s) {
    if (s.role === 'ADMIN') allowed = true;
    else if (s.role === 'PE') allowed = g.entity_id === (await resolveEntityId(s));
  } else {
    const code = (req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase();
    const contact = req.nextUrl.searchParams.get('contact') ?? '';
    allowed = code === (g.grievance_code ?? '') && contactMatches(contact, g);
  }
  if (!allowed) return forbidden('Not permitted to view this attachment.');

  const url = await signedGrievanceUrl(g.attachment_path, 300);
  if (!url) return json({ ok: false, error: 'Could not sign the attachment URL.' }, 502);
  return json({ ok: true, url, expires_in: 300, name: g.attachment_name, mime: g.attachment_mime });
}
