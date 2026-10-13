import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession, guard } from '@/lib/auth';
import { json, badRequest, serverError } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  const g = guard(s, ['ADMIN', 'PE', 'OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL']); if (g) return g;
  return json({ ok: true, settings: await getSettings() });
}

/** Branding + policy settings. Logo may be a base64 data URL or an image URL. */
export async function PUT(req: NextRequest) {
  const s = await getSession();
  const g = guard(s, ['ADMIN']); if (g) return g;
  try {
    const body = await req.json().catch(() => ({}));
    const allowed = ['operator_name', 'operator_short_name', 'logo_data_url', 'brand_color', 'max_kyc_file_mb', 'allowed_kyc_mime', 'retention_days'];
    const client = db();
    for (const key of allowed) {
      if (key in body) {
        if (key === 'logo_data_url') {
          const v = body[key];
          if (typeof v === 'string' && v.length > 1_500_000) return badRequest('Logo is too large (max ~1.5 MB as a data URL).');
        }
        await client.from('platform_settings').upsert({ key, value: { value: body[key] }, updated_at: new Date().toISOString(), updated_by: s!.uid }, { onConflict: 'key' });
      }
    }
    await logAudit({ entity_id: null, module: 'ADMIN', record_id: null, action: 'UPDATE_SETTINGS', actor_id: s!.uid, actor_email: s!.email, actor_role: s!.role, from_status: null, to_status: null, remarks: Object.keys(body).join(', ') });
    return json({ ok: true, settings: await getSettings() });
  } catch (e) { return serverError(e); }
}
