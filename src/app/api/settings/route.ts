import { getSession, guard } from '@/lib/auth';
import { json } from '@/lib/http';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Branding + limits for any signed-in user. Read-only; writes go to /api/admin/settings. */
export async function GET() {
  const s = await getSession();
  const g = guard(s, ['PE', 'OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN']);
  if (g) return g;
  const settings = await getSettings();
  return json({ ok: true, settings: {
    operatorName: settings.operatorName, operatorShortName: settings.operatorShortName,
    logoDataUrl: settings.logoDataUrl, brandColor: settings.brandColor,
    maxKycFileMb: settings.maxKycFileMb, allowedKycMime: settings.allowedKycMime,
  }});
}
