import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { providerSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { maskAuthConfig, mergeAuthConfig } from '@/lib/redact';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const { data } = await db().from('api_providers').select('*').eq('id', params.id).maybeSingle();
  if (!data) return notFound('Provider not found.');
  return json({ ok: true, provider: { ...data, auth_config: maskAuthConfig(data.auth_config) } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const { data: current } = await db().from('api_providers').select('*').eq('id', params.id).maybeSingle();
    if (!current) return notFound('Provider not found.');
    const parsed = providerSchema.partial().safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest('Validation failed');
    const values: Record<string, unknown> = { ...parsed.data };
    // A masked secret means "keep what is stored" — the real value never left the server.
    if (values.auth_config) values.auth_config = mergeAuthConfig(values.auth_config as Record<string, string>, current.auth_config ?? {});
    if (values.is_default && values.channel) {
      await db().from('api_providers').update({ is_default: false }).eq('channel', values.channel as string).neq('id', params.id);
    }
    const { data, error } = await db().from('api_providers').update(values).eq('id', params.id).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: null, module: 'API_CONFIG', record_id: params.id, action: 'UPDATE_PROVIDER', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: null, remarks: current.provider_name });
    return json({ ok: true, provider: { ...data, auth_config: maskAuthConfig(data.auth_config) } });
  } catch (e) { return serverError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const { data: current } = await db().from('api_providers').select('provider_name').eq('id', params.id).maybeSingle();
  if (!current) return notFound('Provider not found.');
  const { error } = await db().from('api_providers').delete().eq('id', params.id);
  if (error) return badRequest(error.message);
  await logAudit({ entity_id: null, module: 'API_CONFIG', record_id: params.id, action: 'DELETE_PROVIDER', actor_id: s!.uid, actor_email: s!.email, actor_name: s!.name ?? null, actor_role: s!.role, from_status: null, to_status: null, remarks: current.provider_name });
  return json({ ok: true });
}
