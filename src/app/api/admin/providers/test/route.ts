import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { executeRequest, type ProviderRequestConfig } from '@/lib/apiRequest';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Postman-style "Send" — runs a real outbound request for the configured (or
 *  ad-hoc, unsaved) provider and returns the status, latency and response.
 *  Body: { provider?: {...config}, providerId?: string, vars?: {...} } */
export async function POST(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const vars = (body.vars ?? {}) as Record<string, string>;
    let config: ProviderRequestConfig | null = null;
    let providerId: string | null = null;

    if (body.providerId) {
      const { data } = await db().from('api_providers').select('*').eq('id', String(body.providerId)).maybeSingle();
      if (!data) return notFound('Provider not found.');
      providerId = data.id;
      config = {
        channel: data.channel, provider_name: data.provider_name, base_url: data.base_url,
        http_method: data.http_method, headers: data.headers ?? {}, query_params: data.query_params ?? {},
        body_template: data.body_template, auth_type: data.auth_type, auth_config: data.auth_config ?? {},
        timeout_ms: data.timeout_ms,
      };
    } else if (body.provider) {
      const p = body.provider;
      if (!p.base_url || !p.channel) return badRequest('provider.base_url and provider.channel are required.');
      config = {
        channel: p.channel, provider_name: p.provider_name ?? 'ad-hoc', base_url: p.base_url,
        http_method: p.http_method ?? 'POST', headers: p.headers ?? {}, query_params: p.query_params ?? {},
        body_template: p.body_template ?? null, auth_type: p.auth_type ?? 'NONE', auth_config: p.auth_config ?? {},
        timeout_ms: Number(p.timeout_ms ?? 15000),
      };
    } else {
      return badRequest('Provide either providerId or provider.');
    }

    const result = await executeRequest(config, vars);
    await logAudit({ entity_id: null, module: 'API_CONFIG', record_id: providerId, action: 'TEST_PROVIDER', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: String(result.status ?? 'ERR'), remarks: `${config.channel}:${config.provider_name} ${result.ok ? 'OK' : 'FAIL'} in ${result.timeMs}ms` });
    return json({ ok: true, result });
  } catch (e) { return serverError(e); }
}
