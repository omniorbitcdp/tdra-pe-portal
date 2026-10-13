import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest } from '@/lib/http';
import type { Role } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const QUEUE_TABLE: Record<string, string> = { KYC: 'entities', HEADER: 'header_registrations', TEMPLATE: 'template_registrations', URL: 'url_registrations' };
const MODULE_ROLES: Record<string, Role[]> = {
  KYC: ['OPERATOR_KYC', 'ADMIN'],
  HEADER: ['OPERATOR_HEADER', 'ADMIN'],
  TEMPLATE: ['OPERATOR_TEMPLATE_URL', 'ADMIN'],
  URL: ['OPERATOR_TEMPLATE_URL', 'ADMIN'],
};

/** Role-scoped approval work queue (§7.1). */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN']); if (g) return g;
  const module = req.nextUrl.searchParams.get('module') ?? defaultModule(s!.role);
  if (!QUEUE_TABLE[module]) return badRequest('Invalid module.');
  if (!MODULE_ROLES[module].includes(s!.role)) return json({ ok: false, error: 'Your role cannot access this queue.' }, 403);

  const table = QUEUE_TABLE[module];
  const client = db();
  const { data: rows } = await client.from(table).select('*').order('created_at', { ascending: false });
  const list = rows ?? [];

  // Attach the entity name for display.
  const entityIds = Array.from(new Set(list.map((r: { entity_id?: string; id?: string }) => module === 'KYC' ? r.id! : r.entity_id!).filter(Boolean)));
  const { data: entities } = entityIds.length
    ? await client.from('entities').select('id,legal_entity_name,entity_type,kyc_status').in('id', entityIds)
    : { data: [] as Array<{ id: string; legal_entity_name: string }> };
  const nameById = new Map((entities ?? []).map((e: { id: string; legal_entity_name: string }) => [e.id, e.legal_entity_name]));

  const enriched = list.map((r: Record<string, unknown>) => {
    const eid = (module === 'KYC' ? r.id : r.entity_id) as string;
    return { ...r, entity_name: nameById.get(eid) ?? '—' };
  });
  return json({ ok: true, module, queue: enriched });
}

function defaultModule(role: Role): string {
  switch (role) {
    case 'OPERATOR_KYC': return 'KYC';
    case 'OPERATOR_HEADER': return 'HEADER';
    case 'OPERATOR_TEMPLATE_URL': return 'TEMPLATE';
    default: return 'KYC';
  }
}
