import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const client = db();
  const head = { count: 'exact' as const, head: true };
  const [entities, headers, templates, urls, users, providers, pendingKyc, failedNotifs] = await Promise.all([
    client.from('entities').select('id', head),
    client.from('header_registrations').select('id', head),
    client.from('template_registrations').select('id', head),
    client.from('url_registrations').select('id', head),
    client.from('app_users').select('id', head),
    client.from('api_providers').select('id', head),
    client.from('entities').select('id', head).in('kyc_status', ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED']),
    client.from('notifications_log').select('id', head).eq('status', 'FAILED'),
  ]);
  return json({ ok: true, counts: {
    entities: entities.count ?? 0,
    pendingKyc: pendingKyc.count ?? 0,
    headers: headers.count ?? 0,
    templates: templates.count ?? 0,
    urls: urls.count ?? 0,
    users: users.count ?? 0,
    providers: providers.count ?? 0,
    failedNotifs: failedNotifs.count ?? 0,
  }});
}
