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

/** Private bucket holding the screenshots subscribers attach to a grievance. */
export function grievanceBucket(): string {
  return process.env.GRIEVANCE_BUCKET ?? 'grievance-attachments';
}

export function grievanceStoragePath(fileName: string): string {
  const safe = (fileName || 'screenshot').replace(/[^\w.\-]+/g, '_').slice(-80);
  const now = new Date();
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${Date.now()}_${safe}`;
}

export async function uploadGrievanceFile(path: string, bytes: ArrayBuffer, mimeType: string): Promise<string> {
  const { error } = await db().storage.from(grievanceBucket()).upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

export async function signedGrievanceUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await db().storage.from(grievanceBucket()).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export const GRIEVANCE_ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
