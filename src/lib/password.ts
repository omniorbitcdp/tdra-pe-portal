// Password hashing & policy. Passwords are ALWAYS stored as bcrypt hashes
// (never plain text, never reversible) — requirements §3, §11, §12.
import bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 10;
/** bcrypt only consumes the first 72 bytes of input; reject longer to avoid silent truncation. */
export const MAX_PASSWORD_BYTES = 72;

export async function hashPassword(plain: string): Promise<string> {
  if (Buffer.byteLength(plain, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error('PASSWORD_TOO_LONG');
  }
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Returns a list of human-readable policy violations ([] = compliant). */
export function passwordPolicyErrors(pw: string): string[] {
  const errs: string[] = [];
  if (pw.length < 10) errs.push('Must be at least 10 characters');
  if (Buffer.byteLength(pw, 'utf8') > MAX_PASSWORD_BYTES) errs.push('Must be at most 72 bytes');
  if (!/[A-Z]/.test(pw)) errs.push('Must contain an uppercase letter');
  if (!/[a-z]/.test(pw)) errs.push('Must contain a lowercase letter');
  if (!/[0-9]/.test(pw)) errs.push('Must contain a digit');
  if (!/[^A-Za-z0-9]/.test(pw)) errs.push('Must contain a symbol');
  return errs;
}

export function isPasswordCompliant(pw: string): boolean {
  return passwordPolicyErrors(pw).length === 0;
}
