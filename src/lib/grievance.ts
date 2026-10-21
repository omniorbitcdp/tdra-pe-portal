// Grievance domain rules: status set, header matching, SLA.
// Pure helpers so both the API routes and the UI share one definition.
import { db } from './db';

export const GRIEVANCE_STATUSES = ['SUBMITTED', 'ACKNOWLEDGED', 'RESOLVED', 'REJECTED', 'CLOSED'] as const;
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

export const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  SUBMITTED: 'Submitted',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

/** Statuses that still need the enterprise to act. */
export const GRIEVANCE_OPEN: GrievanceStatus[] = ['SUBMITTED', 'ACKNOWLEDGED'];

export const GRIEVANCE_CATEGORIES = ['FRAUD', 'PHISHING', 'SPAM', 'UNSOLICITED', 'OTHER'] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];

export const GRIEVANCE_CATEGORY_LABELS: Record<GrievanceCategory, string> = {
  FRAUD: 'Fraud / fake sender',
  PHISHING: 'Phishing link',
  SPAM: 'Spam / unwanted',
  UNSOLICITED: 'Unsolicited promotion',
  OTHER: 'Other',
};

export type GrievanceAction = 'ACKNOWLEDGE' | 'RESOLVE' | 'REJECT' | 'CLOSE';

export const GRIEVANCE_ACTION_TARGET: Record<GrievanceAction, GrievanceStatus> = {
  ACKNOWLEDGE: 'ACKNOWLEDGED',
  RESOLVE: 'RESOLVED',
  REJECT: 'REJECTED',
  CLOSE: 'CLOSED',
};

/** Remarks are mandatory when an enterprise declines or closes a grievance. */
export function grievanceActionRequiresRemarks(action: GrievanceAction): boolean {
  return action === 'RESOLVE' || action === 'REJECT' || action === 'CLOSE';
}

const ALLOWED: Record<GrievanceStatus, GrievanceStatus[]> = {
  SUBMITTED: ['ACKNOWLEDGED', 'RESOLVED', 'REJECTED', 'CLOSED'],
  ACKNOWLEDGED: ['RESOLVED', 'REJECTED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
};

export function canGrievanceTransition(from: string, to: GrievanceStatus): boolean {
  return (ALLOWED[from as GrievanceStatus] ?? []).includes(to);
}

/** Uppercase alphanumerics only — "acme  corp" and "ACMECORP" compare equal. */
export function normaliseHeader(value: string): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface HeaderCandidate {
  id: string; header_code: string | null; header_name: string; sender_id: string;
  status: string; entity_id: string; [k: string]: unknown;
}

export interface HeaderMatch {
  header: HeaderCandidate | null;
  method: 'SENDER_ID' | 'HEADER_CODE' | 'HEADER_NAME' | 'NONE';
}

/**
 * Match what the subscriber typed against registered headers. The grievance is
 * tied to a Principal Entity SOLELY through this match — no other heuristic.
 */
export function matchHeader(reported: string, candidates: HeaderCandidate[]): HeaderMatch {
  const raw = (reported ?? '').trim();
  if (!raw) return { header: null, method: 'NONE' };
  const norm = normaliseHeader(raw);
  const upper = raw.toUpperCase();

  // 1. sender ID is the identifier printed on the SMS — strongest match
  const bySender = candidates.find((h) => normaliseHeader(h.sender_id) === norm);
  if (bySender) return { header: bySender, method: 'SENDER_ID' };

  // 2. the internal reference, if the subscriber quotes it
  const byCode = candidates.find((h) => (h.header_code ?? '').toUpperCase() === upper);
  if (byCode) return { header: byCode, method: 'HEADER_CODE' };

  // 3. the display name of the header
  const byName = candidates.find((h) => (h.header_name ?? '').trim().toLowerCase() === raw.toLowerCase());
  if (byName) return { header: byName, method: 'HEADER_NAME' };

  return { header: null, method: 'NONE' };
}

/** Resolve a reported header to its header row and owning entity. */
export async function resolveGrievanceHeader(reported: string): Promise<{
  match: HeaderMatch; entityId: string | null; entityName: string | null;
}> {
  const { data } = await db().from('header_registrations').select('*').limit(2000);
  const match = matchHeader(reported, (data ?? []) as HeaderCandidate[]);
  if (!match.header) return { match, entityId: null, entityName: null };
  const { data: entity } = await db().from('entities')
    .select('id,legal_entity_name').eq('id', match.header.entity_id).maybeSingle();
  return {
    match,
    entityId: match.header.entity_id ?? null,
    entityName: (entity?.legal_entity_name as string) ?? null,
  };
}

export function slaDueFrom(createdAt: Date, hours: number): Date {
  const h = Number.isFinite(hours) && hours > 0 ? hours : 48;
  return new Date(createdAt.getTime() + h * 3600 * 1000);
}

export function isOverdue(status: string, slaDueAt: string | null | undefined, now = new Date()): boolean {
  if (!GRIEVANCE_OPEN.includes(status as GrievanceStatus)) return false;
  if (!slaDueAt) return false;
  return new Date(slaDueAt).getTime() < now.getTime();
}

/** Whole hours left before the SLA lapses (negative once overdue). */
export function hoursUntil(slaDueAt: string | null | undefined, now = new Date()): number | null {
  if (!slaDueAt) return null;
  return Math.round((new Date(slaDueAt).getTime() - now.getTime()) / 3600000);
}

/** Digits only, so "+971 50 123 4567" and "971501234567" compare equal. */
export function normalisePhone(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Does the supplied contact identify the reporter? Mobile or e-mail. */
export function contactMatches(
  supplied: string,
  grievance: { subscriber_mobile?: string | null; subscriber_email?: string | null },
): boolean {
  const s = (supplied ?? '').trim();
  if (!s) return false;
  const asPhone = normalisePhone(s);
  const storedPhone = normalisePhone(grievance.subscriber_mobile ?? '');
  if (asPhone.length >= 7 && storedPhone.length >= 7) {
    // last 9 digits: tolerant of country-code formatting differences
    if (asPhone.slice(-9) === storedPhone.slice(-9)) return true;
  }
  const email = (grievance.subscriber_email ?? '').trim().toLowerCase();
  if (email && s.toLowerCase() === email) return true;
  return false;
}

export function grievanceCodeIsWellFormed(code: string): boolean {
  return /^GRV-\d{6,9}$/i.test((code ?? '').trim());
}

/** Never expose the reporter's full contact details to the enterprise. */
export function maskContact(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  if (v.includes('@')) {
    const [user, domain] = v.split('@');
    const head = user.slice(0, 2);
    return `${head}${'•'.repeat(Math.max(2, user.length - 2))}@${domain}`;
  }
  const digits = normalisePhone(v);
  if (digits.length < 4) return '•••';
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/** GRV- + 8 random digits. The DB trigger does this too; allocating here keeps
 *  the flow correct even if the migration's trigger has not been applied yet. */
export async function allocateGrievanceCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `GRV-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data } = await db().from('grievances').select('id').eq('grievance_code', code).maybeSingle();
    if (!data) return code;
  }
  throw new Error('Could not allocate a grievance reference.');
}
