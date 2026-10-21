import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { json } from '@/lib/http';
import { normaliseHeader } from '@/lib/grievance';

export const dynamic = 'force-dynamic';

/** Sender IDs the subscriber can pick from. Only APPROVED headers are exposed,
 *  and only the two fields printed on the message. */
export async function GET(req: NextRequest) {
  const q = normaliseHeader(req.nextUrl.searchParams.get('q') ?? '');
  const { data } = await db().from('header_registrations')
    .select('sender_id,header_name,status').eq('status', 'APPROVED').limit(500);
  const rows = (data ?? [])
    .filter((h) => !q || normaliseHeader(String(h.sender_id)).includes(q) || normaliseHeader(String(h.header_name)).includes(q))
    .slice(0, 12)
    .map((h) => ({ sender_id: h.sender_id, header_name: h.header_name }));
  return json({ ok: true, headers: rows });
}
