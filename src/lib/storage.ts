// Supabase Storage helpers for private KYC documents (requirements §5, §11).
import { db } from './db';

export function kycBucket(): string {
  return process.env.KYC_BUCKET ?? 'kyc-documents';
}

export function kycStoragePath(entityId: string, docType: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]+/g, '_');
  return `${entityId}/${docType}/${Date.now()}_${safe}`;
}

export async function uploadKycFile(path: string, bytes: ArrayBuffer, mimeType: string): Promise<string> {
  const { error } = await db().storage.from(kycBucket()).upload(path, bytes, {
    contentType: mimeType, upsert: false,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

/** Short-lived signed URL for authorised reviewers only. */
export async function signedKycUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await db().storage.from(kycBucket()).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
