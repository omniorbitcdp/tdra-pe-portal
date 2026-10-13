// Platform settings / branding (editable at /admin) — operator name + logo.
import { db } from './db';
import { DEFAULT_MAX_KYC_FILE_MB, KYC_ALLOWED_MIME } from './constants';

export interface PlatformSettings {
  operatorName: string;
  operatorShortName: string;
  logoDataUrl: string | null;
  brandColor: string;
  maxKycFileMb: number;
  allowedKycMime: string[];
  retentionDays: Record<string, number>;
  /** When false (default) self-registered PEs are usable immediately — no mail
   *  provider is required. Turn on to require the emailed activation link. */
  requireActivation: boolean;
  emailNotificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  operatorName: 'Telecom Operator',
  operatorShortName: 'TO',
  logoDataUrl: null,
  brandColor: '#345dff',
  maxKycFileMb: DEFAULT_MAX_KYC_FILE_MB,
  allowedKycMime: [...KYC_ALLOWED_MIME],
  retentionDays: { pe_profile: 2555, kyc_documents: 2555, audit_log: 2555, notification_log: 365 },
  requireActivation: false,
  emailNotificationsEnabled: true,
};

/**
 * Settings are read on nearly every page render. A short-lived module cache
 * removes the per-request DB round trip; /admin writes invalidate it so changes
 * still appear immediately.
 */
const TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS ?? '10000');
let cached: { value: PlatformSettings; at: number } | null = null;

export function invalidateSettingsCache(): void {
  cached = null;
}

export async function getSettings(): Promise<PlatformSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (process.env.NODE_ENV === 'test') return DEFAULT_SETTINGS;
  try {
    const { data } = await db().from('platform_settings').select('key,value');
    const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value] as const));
    const val = <T,>(k: string, fallback: T): T => {
      const v = map.get(k) as { value?: T } | undefined;
      return v && v.value !== undefined && v.value !== null ? (v.value as T) : fallback;
    };
    const value: PlatformSettings = {
      operatorName: val('operator_name', DEFAULT_SETTINGS.operatorName),
      operatorShortName: val('operator_short_name', DEFAULT_SETTINGS.operatorShortName),
      logoDataUrl: val<string | null>('logo_data_url', null),
      brandColor: val('brand_color', DEFAULT_SETTINGS.brandColor),
      maxKycFileMb: val('max_kyc_file_mb', DEFAULT_SETTINGS.maxKycFileMb),
      allowedKycMime: val('allowed_kyc_mime', DEFAULT_SETTINGS.allowedKycMime),
      retentionDays: val('retention_days', DEFAULT_SETTINGS.retentionDays),
      requireActivation: val('require_activation', DEFAULT_SETTINGS.requireActivation),
      emailNotificationsEnabled: val('email_notifications_enabled', DEFAULT_SETTINGS.emailNotificationsEnabled),
    };
    cached = { value, at: Date.now() };
    return value;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
