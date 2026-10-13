import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError, notFound } from '@/lib/http';
import { providerSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const { data } = await db().from('api_providers').select('*').eq('id', params.id).maybeSingle();
  if (!data) return notFound('Provider not found.');
  return json({ ok: true, provider: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const { data: current } = await db().from('api_providers').select('*').eq('id', params.id).maybeSingle();
    if (!current) return notFound('Provider not found.');
    const parsed = providerSchema.partial().safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest('Validation failed');
    const values = parsed.data;
    if (values.is_default && values.channel) {
      await db().from('api_providers').update({ is_default: false }).eq('channel', values.channel).neq('id', params.id);
    }
    const { data, error } = await db().from('api_providers').update(values).eq('id', params.id).select('*').single();
    if (error) return badRequest(error.message);
    await logAudit({ entity_id: null, module: 'API_CONFIG', record_id: params.id, action: 'UPDATE_PROVIDER', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: null, remarks: current.provider_name });
    return json({ ok: true, provider: data });
  } catch (e) { return serverError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  const { data: current } = await db().from('api_providers').select('provider_name').eq('id', params.id).maybeSingle();
  if (!current) return notFound('Provider not found.');
  const { error } = await db().from('api_providers').delete().eq('id', params.id);
  if (error) return badRequest(error.message);
  await logAudit({ entity_id: null, module: 'API_CONFIG', record_id: params.id, action: 'DELETE_PROVIDER', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: null, remarks: current.provider_name });
  return json({ ok: true });
}
