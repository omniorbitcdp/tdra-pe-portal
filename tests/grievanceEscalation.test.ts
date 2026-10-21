/** v2.5 — escalation to the telco, return to the enterprise, reporter re-open. */
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, signInAs, makeRequest } from './helpers/harness';
import { resetRateLimit } from '@/lib/rateLimit';
import * as grievances from '@/app/api/grievances/route';
import * as track from '@/app/api/grievances/track/route';
import * as reopen from '@/app/api/grievances/reopen/route';
import * as peGrievances from '@/app/api/pe/grievances/route';
import * as adminGrievances from '@/app/api/admin/grievances/route';

const status = (r: unknown) => (r as { status: number }).status;
const body = (r: unknown) => (r as { _data: any })._data;
const MOBILE = '+971 50 123 4567';

async function file(over: Record<string, unknown> = {}) {
  const res = await grievances.POST(makeRequest('/api/grievances', {
    body: {
      reported_header: 'ALPHA', message_content: 'Click http://scam.example now', category: 'PHISHING',
      subscriber_mobile: MOBILE, subscriber_email: 'victim@example.com', subscriber_name: 'Subscriber One',
      ...over,
    },
  }) as never);
  return body(res).grievance as { id: string; grievance_code: string; sla_due_at: string };
}

const peAct = (id: string, action: string, remarks?: string) =>
  peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id, action, remarks } }) as never);

const adminAct = (id: string, action: string, remarks?: string) =>
  adminGrievances.POST(makeRequest('/api/admin/grievances', { body: { id, action, remarks } }) as never);

const subAct = (grievanceId: string, action: string, reason?: string, contact = MOBILE) =>
  reopen.POST(makeRequest('/api/grievances/reopen', { body: { grievanceId, contact, action, reason } }) as never);

const peList = async () => body(await peGrievances.GET()).grievances as any[];
const adminList = async () => body(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never)).grievances as any[];

const findByCode = (rows: any[], code: string) => rows.find((r) => r.grievance_code === code);

beforeEach(async () => { freshDb(); resetRateLimit(); await signInAs(null); });

// ===========================================================================
describe('enterprise escalates to the platform administrator', () => {
  it('moves the case to ESCALATED and records who escalated and why', async () => {
    const g = await file();
    await signInAs('peA');
    const res = await peAct(g.id, 'ESCALATE', 'Sender ID appears to be spoofed — a ruling is needed.');
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).grievance.status).toBe('ESCALATED');
    expect(body(res).grievance.escalation_reason).toContain('spoofed');
    expect(body(res).grievance.escalated_at).toBeTruthy();
    expect(body(res).grievance.escalated_by_role).toBe('PE');
  });

  it('requires a written reason', async () => {
    const g = await file();
    await signInAs('peA');
    expect(status(await peAct(g.id, 'ESCALATE', ''))).toBe(400);
    expect(status(await peAct(g.id, 'ESCALATE', 'nope'))).toBe(400);
  });

  it('another enterprise cannot escalate it', async () => {
    const g = await file();
    await signInAs('peB');
    expect(status(await peAct(g.id, 'ESCALATE', 'not my case at all'))).toBe(403);
  });

  it('surfaces the escalated case to the administrator with return/resolve available', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Needs a platform ruling.');

    await signInAs('admin');
    const d = body(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never));
    expect(d.summary.escalated).toBe(1);
    const row = findByCode(d.grievances, g.grievance_code);
    expect(row.status).toBe('ESCALATED');
    expect(row.enterprise).toBe('Alpha Telecom');
    expect(row.actions).toContain('RETURN_TO_PE');
    expect(row.actions).toContain('RESOLVE');
  });

  it('stays visible to the enterprise, counted separately, and offers no enterprise action', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Over to you.');

    const d = body(await peGrievances.GET());
    const row = findByCode(d.grievances, g.grievance_code);
    expect(row.status).toBe('ESCALATED');
    expect(row.actions).toEqual([]);
    expect(d.summary.escalated).toBe(1);
    expect(d.summary.open).toBe(0);
  });

  it('cannot be escalated once resolved by the enterprise', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'RESOLVE', 'Handled with the subscriber.');
    expect(status(await peAct(g.id, 'ESCALATE', 'Changed our mind'))).toBe(409);
  });
});

// ===========================================================================
describe('administrator returns an escalated case to the enterprise', () => {
  it('returns it with a note, reopening the enterprise queue and resetting the SLA', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Please rule on this one.');

    await signInAs('admin');
    const res = await adminAct(g.id, 'RETURN_TO_PE', 'Justify why this header was used for a promotion.');
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).grievance.status).toBe('RETURNED_TO_PE');
    expect(body(res).grievance.return_reason).toContain('Justify');

    const returnedAt = new Date(body(res).grievance.returned_at).getTime();
    const sla = new Date(body(res).grievance.sla_due_at).getTime();
    expect(Math.abs(sla - (returnedAt + 48 * 3600 * 1000))).toBeLessThan(10_000);

    await signInAs('peA');
    const d = body(await peGrievances.GET());
    const row = findByCode(d.grievances, g.grievance_code);
    expect(row.status).toBe('RETURNED_TO_PE');
    expect(row.return_reason).toContain('Justify');
    expect(row.actions).toContain('RESOLVE');
    expect(row.actions).toContain('ESCALATE');
    expect(d.summary.open).toBe(1);
  });

  it('refuses a return without a note', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Please rule.');
    await signInAs('admin');
    expect(status(await adminAct(g.id, 'RETURN_TO_PE', ''))).toBe(400);
  });

  it('lets the enterprise resolve it after the return', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Please rule.');
    await signInAs('admin');
    await adminAct(g.id, 'RETURN_TO_PE', 'Explain the campaign.');
    await signInAs('peA');
    const res = await peAct(g.id, 'RESOLVE', 'Campaign was ours and has been stopped.');
    expect(status(res)).toBe(200);
    expect(body(res).grievance.status).toBe('RESOLVED');
  });

  it('can rule on the escalated case itself', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Please rule.');
    await signInAs('admin');
    const res = await adminAct(g.id, 'RESOLVE', 'Platform ruling: sender ID was spoofed.');
    expect(status(res)).toBe(200);
    expect(body(res).grievance.status).toBe('RESOLVED');
  });

  it('the enterprise cannot return a case to itself', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Please rule.');
    expect(status(await peAct(g.id, 'RETURN_TO_PE', 'bounce it back'))).toBe(409);
  });
});

// ===========================================================================
describe('subscriber re-opens or escalates a concluded grievance', () => {
  async function concluded() {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'RESOLVE', 'We blocked the sender.');
    await signInAs(null);
    return g;
  }

  it('re-opens a resolved grievance, counts it and puts it back in the enterprise queue', async () => {
    const g = await concluded();
    const before = body(await track.GET(makeRequest(`/api/grievances/track?grievanceId=${g.grievance_code}&contact=%2B971501234567`) as never)).grievance;
    expect(before.can_reopen).toBe(true);
    expect(before.can_escalate).toBe(true);
    expect(before.reopen_count).toBe(0);

    const res = await subAct(g.grievance_code, 'REOPEN', 'It happened again this morning.');
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).grievance.status).toBe('REOPENED');

    const after = body(await track.GET(makeRequest(`/api/grievances/track?grievanceId=${g.grievance_code}&contact=victim%40example.com`) as never)).grievance;
    expect(after.status).toBe('REOPENED');
    expect(after.reopen_count).toBe(1);
    expect(after.reopen_reason).toContain('again');
    expect(after.reopened_at).toBeTruthy();
    expect(after.can_reopen).toBe(false);

    await signInAs('peA');
    const d = body(await peGrievances.GET());
    expect(findByCode(d.grievances, g.grievance_code).status).toBe('REOPENED');
    expect(d.summary.open).toBe(1);
  });

  it('escalates a resolved grievance straight to the administrator', async () => {
    const g = await concluded();
    const res = await subAct(g.grievance_code, 'ESCALATE', 'The enterprise response ignores my complaint.');
    expect(status(res)).toBe(200);
    expect(body(res).grievance.status).toBe('ESCALATED');

    await signInAs('admin');
    expect(body(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never)).summary.escalated).toBe(1);
  });

  it('re-opens a closed grievance before the enterprise can act again', async () => {
    const g = await concluded();
    await signInAs('admin');
    await adminAct(g.id, 'CLOSE', 'Closed after verification.');
    await signInAs('peA');
    expect(findByCode(await peList(), g.grievance_code).actions).toEqual([]);

    await signInAs(null);
    expect(status(await subAct(g.grievance_code, 'REOPEN', 'Still receiving the messages.'))).toBe(200);
    await signInAs('peA');
    expect(findByCode(await peList(), g.grievance_code).actions).toContain('RESOLVE');
  });

  it('cannot re-open a case the enterprise is still working on', async () => {
    const g = await file();
    expect(status(await subAct(g.grievance_code, 'REOPEN', 'Too early for this.'))).toBe(409);
  });

  it('refuses a wrong contact and an unknown id', async () => {
    const g = await concluded();
    expect(status(await subAct(g.grievance_code, 'REOPEN', 'Not my number', '+971599999999'))).toBe(404);
    expect(status(await subAct('GRV-00000000', 'REOPEN', 'No such case'))).toBe(404);
  });

  it('requires a reason', async () => {
    const g = await concluded();
    expect(status(await subAct(g.grievance_code, 'REOPEN', ''))).toBe(400);
    expect(status(await subAct(g.grievance_code, 'REOPEN', 'bad'))).toBe(400);
  });

  it('refuses an arbitrary action name', async () => {
    const g = await concluded();
    expect(status(await subAct(g.grievance_code, 'DELETE', 'let me try this'))).toBe(400);
  });
});

// ===========================================================================
describe('status machine and timeline', () => {
  it('admin cannot re-open on the reporter behalf', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'RESOLVE', 'Done.');
    await signInAs('admin');
    expect((await adminList()).find((r) => r.grievance_code === g.grievance_code).actions).not.toContain('REOPEN');
    expect(status(await adminAct(g.id, 'REOPEN', 'reopen it for them'))).toBe(409);
  });

  it('the tracker timeline shows the escalation, return and re-open stages', async () => {
    const g = await file();
    await signInAs('peA');
    await peAct(g.id, 'ESCALATE', 'Please rule on this.');
    await signInAs('admin');
    await adminAct(g.id, 'RETURN_TO_PE', 'Explain the campaign please.');
    await signInAs('peA');
    await peAct(g.id, 'RESOLVE', 'Campaign stopped.');
    await signInAs(null);
    await subAct(g.grievance_code, 'REOPEN', 'It started again.');

    const t = body(await track.GET(makeRequest(`/api/grievances/track?grievanceId=${g.grievance_code}&contact=%2B971501234567`) as never)).grievance;
    const labels = t.timeline.map((x: any) => x.label).join(' | ');
    expect(labels).toContain('Escalated to the platform administrator');
    expect(labels).toContain('Returned to the enterprise for justification');
    expect(labels).toContain('Re-opened by the reporter');
    expect(t.escalation_reason).toBe('Please rule on this.');
    expect(t.return_reason).toBe('Explain the campaign please.');
    expect(t.reopen_count).toBe(1);
  });

  it('a reviewer cannot reach either queue', async () => {
    await signInAs('kyc');
    expect(status(await peGrievances.GET())).toBe(403);
    expect(status(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never))).toBe(403);
  });
});
