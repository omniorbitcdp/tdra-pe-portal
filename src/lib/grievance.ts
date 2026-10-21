// Grievance domain rules: status machine, header matching, SLA, timeline.
// Pure helpers so the API routes and the UI share one definition.
import { db } from './db';

/* ---------------------------------------------------------------------------
 * Lifecycle
 *
 *   SUBMITTED → ACKNOWLEDGED → RESOLVED/REJECTED → CLOSED
 *                     ↘ ESCALATED (to the platform administrator)
 *                          → RETURNED_TO_PE (back to the enterprise)
 *   RESOLVED / REJECTED / CLOSED → REOPENED (by the reporter)
 *
 * Every transition is validated server-side by canGrievanceTransition().
 * ------------------------------------------------------------------------ */
export const GRIEVANCE_STATUSES = [
  'SUBMITTED', 'ACKNOWLEDGED', 'RESOLVED', 'REJECTED', 'CLOSED',
  'ESCALATED', 'RETURNED_TO_PE', 'REOPENED',
] as const;
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

export const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  SUBMITTED: 'Submitted',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
  ESCALATED: 'Escalated to telco',
  RETURNED_TO_PE: 'Returned to enterprise',
  REOPENED: 'Re-opened',
};

/** Awaiting action from the enterprise (drives its queue and counters). */
export const GRIEVANCE_OPEN: GrievanceStatus[] = ['SUBMITTED', 'ACKNOWLEDGED', 'REOPENED', 'RETURNED_TO_PE'];
/** Awaiting action from the platform administrator. */
export const GRIEVANCE_WITH_ADMIN: GrievanceStatus[] = ['ESCALATED'];
/** Concluded — the reporter may re-open or escalate. */
export const GRIEVANCE_CONCLUDED: GrievanceStatus[] = ['RESOLVED', 'REJECTED', 'CLOSED'];

export const GRIEVANCE_CATEGORIES = ['FRAUD', 'PHISHING', 'SPAM', 'UNSOLICITED', 'OTHER'] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];

export const GRIEVANCE_CATEGORY_LABELS: Record<GrievanceCategory, string> = {
  FRAUD: 'Fraud / fake sender',
  PHISHING: 'Phishing link',
  SPAM: 'Spam / unwanted',
  UNSOLICITED: 'Unsolicited promotion',
  OTHER: 'Other',
};

export type GrievanceAction =
  | 'ACKNOWLEDGE' | 'RESOLVE' | 'REJECT' | 'CLOSE'
  | 'ESCALATE' | 'RETURN_TO_PE' | 'REOPEN';

export const GRIEVANCE_ACTION_TARGET: Record<GrievanceAction, GrievanceStatus> = {
  ACKNOWLEDGE: 'ACKNOWLEDGED',
  RESOLVE: 'RESOLVED',
  REJECT: 'REJECTED',
  CLOSE: 'CLOSED',
  ESCALATE: 'ESCALATED',
  RETURN_TO_PE: 'RETURNED_TO_PE',
  REOPEN: 'REOPENED',
};

export const GRIEVANCE_ACTION_LABELS: Record<GrievanceAction, string> = {
  ACKNOWLEDGE: 'Acknowledge',
  RESOLVE: 'Resolve',
  REJECT: 'Not our header',
  CLOSE: 'Close',
  ESCALATE: 'Escalate to telco',
  RETURN_TO_PE: 'Return to enterprise',
  REOPEN: 'Re-open',
};

/** A written note is mandatory for every concluding or escalating action. */
export function grievanceActionRequiresRemarks(action: GrievanceAction): boolean {
  return action !== 'ACKNOWLEDGE';
}

const ALLOWED: Record<GrievanceStatus, GrievanceStatus[]> = {
  SUBMITTED: ['ACKNOWLEDGED', 'RESOLVED', 'REJECTED', 'ESCALATED', 'CLOSED'],
  ACKNOWLEDGED: ['RESOLVED', 'REJECTED', 'ESCALATED', 'CLOSED'],
  REOPENED: ['ACKNOWLEDGED', 'RESOLVED', 'REJECTED', 'ESCALATED', 'CLOSED'],
  RETURNED_TO_PE: ['ACKNOWLEDGED', 'RESOLVED', 'REJECTED', 'ESCALATED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'ESCALATED', 'REOPENED'],
  REJECTED: ['CLOSED', 'ESCALATED', 'REOPENED'],
  ESCALATED: ['RETURNED_TO_PE', 'RESOLVED', 'REJECTED', 'CLOSED'],
  CLOSED: ['REOPENED'],
};

export function canGrievanceTransition(from: string, to: GrievanceStatus): boolean {
  return (ALLOWED[from as GrievanceStatus] ?? []).includes(to);
}

/** Which actions a role may take on a grievance in a given status. */
export function actionsFor(actor: 'PE' | 'ADMIN' | 'SUBSCRIBER', status: string): GrievanceAction[] {
  const out: GrievanceAction[] = [];
  const allowed = (a: GrievanceAction) => canGrievanceTransition(status, GRIEVANCE_ACTION_TARGET[a]);
  if (actor === 'PE') {
    if (GRIEVANCE_OPEN.includes(status as GrievanceStatus)) {
      for (const a of ['ACKNOWLEDGE', 'RESOLVE', 'REJECT', 'ESCALATE', 'CLOSE'] as GrievanceAction[]) if (allowed(a)) out.push(a);
    }
  } else if (actor === 'ADMIN') {
    for (const a of ['RETURN_TO_PE', 'RESOLVE', 'REJECT', 'CLOSE'] as GrievanceAction[]) if (allowed(a)) out.push(a);
  } else {
    if (GRIEVANCE_CONCLUDED.includes(status as GrievanceStatus)) {
      for (const a of ['REOPEN', 'ESCALATE'] as GrievanceAction[]) if (allowed(a)) out.push(a);
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Timeline — derived from the status AND its timestamps, so an action taken in
 * one step never leaves a gap, and a stale read can never show the wrong stage.
 * ------------------------------------------------------------------------ */
export interface GrievanceTimelineRow { key: string; label: string; at: string | null; done: boolean }

const ACK_IMPLIED = ['ACKNOWLEDGED', 'RESOLVED', 'REJECTED', 'ESCALATED', 'RETURNED_TO_PE', 'CLOSED'];

export function timelineFor(g: {
  status: string;
  created_at?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  escalated_at?: string | null;
  returned_at?: string | null;
  reopened_at?: string | null;
  closed_at?: string | null;
}): GrievanceTimelineRow[] {
  const rows: GrievanceTimelineRow[] = [
    { key: 'received', label: 'Grievance received', at: g.created_at ?? null, done: true },
    {
      key: 'acknowledged',
      label: 'Acknowledged by the enterprise',
      at: g.acknowledged_at ?? null,
      done: Boolean(g.acknowledged_at) || ACK_IMPLIED.includes(g.status),
    },
  ];
  if (g.escalated_at || g.status === 'ESCALATED') {
    rows.push({ key: 'escalated', label: 'Escalated to the platform administrator', at: g.escalated_at ?? null, done: true });
  }
  if (g.returned_at || g.status === 'RETURNED_TO_PE') {
    rows.push({ key: 'returned', label: 'Returned to the enterprise for justification', at: g.returned_at ?? null, done: true });
  }
  // The decision stage only exists once a decision was taken — an escalated
  // case must not show an empty "resolved" step above the escalation.
  if (g.resolved_at || g.status === 'RESOLVED' || g.status === 'REJECTED') {
    rows.push({
      key: 'decided',
      label: g.status === 'REJECTED' ? 'Declined by the enterprise' : 'Resolved by the enterprise',
      at: g.resolved_at ?? null,
      done: true,
    });
  }
  if (g.reopened_at || g.status === 'REOPENED') {
    rows.push({ key: 'reopened', label: 'Re-opened by the reporter', at: g.reopened_at ?? null, done: true });
  }
  if (g.closed_at || g.status === 'CLOSED') {
    rows.push({ key: 'closed', label: 'Closed', at: g.closed_at ?? null, done: true });
  }
  // Chronological where timestamps exist; undated rows keep their place at the end.
  const rank = (r: GrievanceTimelineRow) => (r.at ? new Date(r.at).getTime() : Number.MAX_SAFE_INTEGER);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map((x) => x.r);
}

/* ---------------------------------------------------------------------------
 * Header matching
 * ------------------------------------------------------------------------ */
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

  const bySender = candidates.find((h) => normaliseHeader(h.sender_id) === norm);
  if (bySender) return { header: bySender, method: 'SENDER_ID' };

  const byCode = candidates.find((h) => (h.header_code ?? '').toUpperCase() === upper);
  if (byCode) return { header: byCode, method: 'HEADER_CODE' };

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

/* ---------------------------------------------------------------------------
 * SLA
 * ------------------------------------------------------------------------ */
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

/* ---------------------------------------------------------------------------
 * Reporter identity & privacy
 * ------------------------------------------------------------------------ */
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

/** GRV- + 8 random digits. Allocated here so the flow works even before the
 *  migration's trigger exists; the trigger takes over once applied. */
export async function allocateGrievanceCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `GRV-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data } = await db().from('grievances').select('id').eq('grievance_code', code).maybeSingle();
    if (!data) return code;
  }
  throw new Error('Could not allocate a grievance reference.');
}
