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
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  operatorName: 'Telecom Operator',
  operatorShortName: 'TO',
  logoDataUrl: null,
  brandColor: '#345dff',
  maxKycFileMb: DEFAULT_MAX_KYC_FILE_MB,
  allowedKycMime: [...KYC_ALLOWED_MIME],
  retentionDays: { pe_profile: 2555, kyc_documents: 2555, audit_log: 2555, notification_log: 365 },
};

export async function getSettings(): Promise<PlatformSettings> {
  try {
    const { data } = await db().from('platform_settings').select('key,value');
    const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value] as const));
    const val = <T,>(k: string, fallback: T): T => {
      const v = map.get(k) as { value?: T } | undefined;
      return v && v.value !== undefined && v.value !== null ? (v.value as T) : fallback;
    };
    return {
      operatorName: val('operator_name', DEFAULT_SETTINGS.operatorName),
      operatorShortName: val('operator_short_name', DEFAULT_SETTINGS.operatorShortName),
      logoDataUrl: val<string | null>('logo_data_url', null),
      brandColor: val('brand_color', DEFAULT_SETTINGS.brandColor),
      maxKycFileMb: val('max_kyc_file_mb', DEFAULT_SETTINGS.maxKycFileMb),
      allowedKycMime: val('allowed_kyc_mime', DEFAULT_SETTINGS.allowedKycMime),
      retentionDays: val('retention_days', DEFAULT_SETTINGS.retentionDays),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
