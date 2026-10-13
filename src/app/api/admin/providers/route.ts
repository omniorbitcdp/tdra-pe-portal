import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { providerSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { maskAuthConfig, mergeAuthConfig } from '@/lib/redact';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const channel = req.nextUrl.searchParams.get('channel');
  let query = db().from('api_providers').select('*').order('channel').order('provider_name');
  if (channel) query = query.eq('channel', channel);
  const { data } = await query;
  // Secrets are replaced with a mask — the UI never receives the real value.
  const providers = (data ?? []).map((p: Record<string, unknown>) => ({ ...p, auth_config: maskAuthConfig(p.auth_config as Record<string, string>) }));
  return json({ ok: true, providers });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const parsed = providerSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[i.path.join('.')] = i.message;
      return badRequest('Validation failed', { errors });
    }
    const values = { ...parsed.data, auth_config: mergeAuthConfig(parsed.data.auth_config, {}), created_by: s!.uid };
    if (values.is_default) {
      await db().from('api_providers').update({ is_default: false }).eq('channel', values.channel);
    }
    const { data, error } = await db().from('api_providers').insert(values).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: null, module: 'API_CONFIG', record_id: data.id, action: 'CREATE_PROVIDER', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: null, remarks: `${values.channel}/${values.provider_name}` });
    return json({ ok: true, provider: { ...data, auth_config: maskAuthConfig(data.auth_config) } });
  } catch (e) { return serverError(e); }
}
