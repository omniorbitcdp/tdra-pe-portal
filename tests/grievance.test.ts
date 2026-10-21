/** End-to-end grievance flow: subscriber → enterprise → administrator. */
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, signInAs, makeRequest, PE_A_ENTITY, PE_B_ENTITY } from './helpers/harness';
import { resetRateLimit } from '@/lib/rateLimit';
import * as grievances from '@/app/api/grievances/route';
import * as track from '@/app/api/grievances/track/route';
import * as attachment from '@/app/api/grievances/attachment/route';
import * as peGrievances from '@/app/api/pe/grievances/route';
import * as adminGrievances from '@/app/api/admin/grievances/route';

const status = (r: unknown) => (r as { status: number }).status;
const body = (r: unknown) => (r as { _data: any })._data;

function newGrievance(over: Record<string, unknown> = {}) {
  return makeRequest('/api/grievances', {
    body: {
      reported_header: 'ALPHA', message_content: 'Dear customer, click http://scam.example to claim',
      category: 'PHISHING', highlighted_url: 'http://scam.example', highlighted_phone: '+971500000111',
      subscriber_mobile: '+971 50 123 4567', subscriber_email: 'victim@example.com',
      subscriber_name: 'Subscriber One', description: 'Received twice', ...over,
    },
  });
}

async function file(over: Record<string, unknown> = {}) {
  const res = await grievances.POST(newGrievance(over) as never);
  return { res, g: body(res).grievance };
}

beforeEach(async () => { freshDb(); resetRateLimit(); await signInAs(null); });

// ===========================================================================
describe('subscriber: raising a grievance', () => {
  it('creates a grievance, issues a GRV id and routes it to the header owner', async () => {
    const { res, g } = await file();
    expect(status(res)).toBe(200);
    expect(g.grievance_code).toMatch(/^GRV-\d{8}$/);
    expect(body(res).matched).toBe(true);
    expect(body(res).enterprise).toBe('Alpha Telecom');
    expect(g.status).toBe('SUBMITTED');
  });

  it('records the suspicious URL and phone the subscriber highlighted', async () => {
    const { g } = await file();
    expect(g.highlighted_url).toBe('http://scam.example');
    expect(g.highlighted_phone).toBe('+971500000111');
  });

  it('matches a header typed with different spacing or case', async () => {
    const { res } = await file({ reported_header: '  alpha  ' });
    expect(body(res).matched).toBe(true);
    expect(body(res).enterprise).toBe('Alpha Telecom');
  });

  it('leaves an unknown header unmatched — the administrator still sees it', async () => {
    const { res, g } = await file({ reported_header: 'NOT-A-REAL-HEADER' });
    expect(body(res).matched).toBe(false);
    expect(body(res).enterprise).toBeNull();
    await signInAs('admin');
    const list = body(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never));
    expect(list.grievances.map((x: any) => x.grievance_code)).toContain(g.grievance_code);
  });

  it('rejects an empty message', async () => {
    const res = await grievances.POST(newGrievance({ message_content: '' }) as never);
    expect(status(res)).toBe(400);
    expect(JSON.stringify(body(res).errors)).toContain('message_content');
  });

  it('rejects a malformed suspicious URL', async () => {
    const res = await grievances.POST(newGrievance({ highlighted_url: 'not a url' }) as never);
    expect(status(res)).toBe(400);
    expect(JSON.stringify(body(res).errors)).toContain('highlighted_url');
  });

  it('requires a mobile number', async () => {
    const res = await grievances.POST(newGrievance({ subscriber_mobile: '' }) as never);
    expect(status(res)).toBe(400);
  });

  it('accepts a multipart submission with a screenshot', async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      reported_header: 'ALPHA', message_content: 'Screenshot attached', category: 'FRAUD',
      subscriber_mobile: '+971501234567',
    })) fd.set(k, String(v));
    fd.set('attachment', new File([new Uint8Array([137, 80, 78, 71])], 'sms.png', { type: 'image/png' }));
    const res = await grievances.POST(makeRequest('/api/grievances', { form: fd }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).grievance.attachment.name).toBe('sms.png');
  });
});

// ===========================================================================
describe('subscriber: tracking', () => {
  const lookup = (id: string, contact: string) =>
    track.GET(makeRequest(`/api/grievances/track?grievanceId=${encodeURIComponent(id)}&contact=${encodeURIComponent(contact)}`) as never);

  it('shows the grievance to the reporter using the mobile number', async () => {
    const { g } = await file();
    const res = await lookup(g.grievance_code, '+971501234567');
    expect(status(res)).toBe(200);
    expect(body(res).grievance.grievance_code).toBe(g.grievance_code);
    expect(body(res).grievance.enterprise).toBe('Alpha Telecom');
    expect(body(res).grievance.timeline[0].done).toBe(true);
  });

  it('accepts the e-mail as the contact too', async () => {
    const { g } = await file();
    expect(status(await lookup(g.grievance_code, 'VICTIM@example.com'))).toBe(200);
  });

  it('refuses a wrong contact', async () => {
    const { g } = await file();
    expect(status(await lookup(g.grievance_code, '+971599999999'))).toBe(404);
  });

  it('refuses an unknown grievance id', async () => {
    expect(status(await lookup('GRV-00000000', '+971501234567'))).toBe(404);
  });

  it('never exposes the reporter contact in full', async () => {
    const { g } = await file();
    const r = body(await lookup(g.grievance_code, '+971501234567')).grievance;
    expect(r.reporter).not.toContain('victim@example.com');
  });
});

// ===========================================================================
describe('enterprise: only its own header-matched grievances', () => {
  it('PE A sees the grievance, PE B does not', async () => {
    const { g } = await file();
    await signInAs('peA');
    const a = body(await peGrievances.GET());
    expect(a.grievances.map((x: any) => x.grievance_code)).toContain(g.grievance_code);
    expect(a.summary.open).toBe(1);

    await signInAs('peB');
    const b = body(await peGrievances.GET());
    expect(b.grievances).toEqual([]);
  });

  it('an unmatched grievance never appears in any enterprise queue', async () => {
    await file({ reported_header: 'GHOST' });
    await signInAs('peA');
    expect(body(await peGrievances.GET()).grievances).toEqual([]);
    await signInAs('peB');
    expect(body(await peGrievances.GET()).grievances).toEqual([]);
  });

  it('acknowledges, then resolves with a note', async () => {
    const { g } = await file();
    await signInAs('peA');
    const ack = await peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id: g.id, action: 'ACKNOWLEDGE' } }) as never);
    expect(status(ack)).toBe(200);
    expect(body(ack).grievance.status).toBe('ACKNOWLEDGED');

    const res = await peGrievances.POST(makeRequest('/api/pe/grievances', {
      body: { id: g.id, action: 'RESOLVE', remarks: 'Header misused; blocked and reported to TDRA.' },
    }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).grievance.status).toBe('RESOLVED');
    expect(body(res).grievance.resolution_remarks).toContain('blocked');
  });

  it('cannot resolve without a note', async () => {
    const { g } = await file();
    await signInAs('peA');
    expect(status(await peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id: g.id, action: 'RESOLVE', remarks: '' } }) as never))).toBe(400);
  });

  it('another enterprise cannot act on it', async () => {
    const { g } = await file();
    await signInAs('peB');
    expect(status(await peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id: g.id, action: 'RESOLVE', remarks: 'not mine' } }) as never))).toBe(403);
  });

  it('a reviewer and an anonymous caller cannot reach the queue', async () => {
    await signInAs('kyc');
    expect(status(await peGrievances.GET())).toBe(403);
    await signInAs(null);
    expect(status(await peGrievances.GET())).toBe(401);
  });

  it('the resolved outcome reaches the subscriber tracker', async () => {
    const { g } = await file();
    await signInAs('peA');
    await peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id: g.id, action: 'RESOLVE', remarks: 'Action taken.' } }) as never);
    await signInAs(null);
    const t = body(await track.GET(makeRequest(`/api/grievances/track?grievanceId=${g.grievance_code}&contact=%2B971501234567`) as never)).grievance;
    expect(t.status).toBe('RESOLVED');
    expect(t.resolution_remarks).toBe('Action taken.');
    expect(t.timeline.every((x: any) => x.done)).toBe(true);
  });
});

// ===========================================================================
describe('administrator: sees and can close everything', () => {
  it('sees matched and unmatched grievances with the enterprise named', async () => {
    await file();
    await file({ reported_header: 'GHOST' });
    await signInAs('admin');
    const d = body(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never));
    expect(d.grievances).toHaveLength(2);
    expect(d.summary.unmatched).toBe(1);
    expect(d.grievances.find((x: any) => x.reported_header === 'ALPHA').enterprise).toBe('Alpha Telecom');
  });

  it('closes a resolved grievance', async () => {
    const { g } = await file();
    await signInAs('peA');
    await peGrievances.POST(makeRequest('/api/pe/grievances', { body: { id: g.id, action: 'RESOLVE', remarks: 'Handled.' } }) as never);
    await signInAs('admin');
    const res = await adminGrievances.POST(makeRequest('/api/admin/grievances', { body: { id: g.id, action: 'CLOSE', remarks: 'Verified by platform.' } }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).grievance.status).toBe('CLOSED');
  });

  it('rejects an unmatched grievance with a reason', async () => {
    const { g } = await file({ reported_header: 'GHOST' });
    await signInAs('admin');
    const res = await adminGrievances.POST(makeRequest('/api/admin/grievances', { body: { id: g.id, action: 'REJECT', remarks: 'No such header registered.' } }) as never);
    expect(status(res)).toBe(200);
    expect(body(res).grievance.status).toBe('REJECTED');
  });

  it('is refused for a non-admin', async () => {
    await signInAs('peA');
    expect(status(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never))).toBe(403);
    await signInAs('kyc');
    expect(status(await adminGrievances.GET(makeRequest('/api/admin/grievances') as never))).toBe(403);
  });
});

// ===========================================================================
describe('screenshots are access-controlled', () => {
  it('the owning enterprise may open it, another may not', async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ reported_header: 'ALPHA', message_content: 'Evidence', subscriber_mobile: '+971501234567' })) fd.set(k, String(v));
    fd.set('attachment', new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' }));
    const created = body(await grievances.POST(makeRequest('/api/grievances', { form: fd }) as never)).grievance;
    const id = created.id as string;

    await signInAs('peA');
    expect(status(await attachment.GET(makeRequest(`/api/grievances/attachment?id=${id}`) as never))).toBe(200);
    await signInAs('peB');
    expect(status(await attachment.GET(makeRequest(`/api/grievances/attachment?id=${id}`) as never))).toBe(403);
    await signInAs(null);
    expect(status(await attachment.GET(makeRequest(`/api/grievances/attachment?id=${id}`) as never))).toBe(403);
    expect(status(await attachment.GET(makeRequest(`/api/grievances/attachment?id=${id}&code=${created.grievance_code}&contact=%2B971501234567`) as never))).toBe(200);
  });
});
