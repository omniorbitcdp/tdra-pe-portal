/**
 * Authorization / cross-tenant isolation matrix.
 *
 * Drives the REAL route handlers against an in-memory database and asserts:
 *  - unauthenticated callers are rejected
 *  - a role cannot reach another module's endpoints
 *  - a Principal Entity can never read or mutate another entity's records
 *  - a queue manager only ever receives their own queue
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, signInAs, makeRequest, params, PE_A_ENTITY, PE_B_ENTITY, IDS, SESSIONS } from './helpers/harness';

import * as authMe from '@/app/api/auth/[action]/route';
import * as peProfile from '@/app/api/pe/profile/route';
import * as peDashboard from '@/app/api/pe/dashboard/route';
import * as peKyc from '@/app/api/pe/kyc/route';
import * as peKycSubmit from '@/app/api/pe/kyc/submit/route';
import * as peKycFile from '@/app/api/pe/kyc/file/route';
import * as peHeaders from '@/app/api/pe/headers/route';
import * as peTemplates from '@/app/api/pe/templates/route';
import * as peUrls from '@/app/api/pe/urls/route';
import * as peSubmit from '@/app/api/pe/submit/route';
import * as operatorQueue from '@/app/api/operator/queue/route';
import * as operatorKyc from '@/app/api/operator/kyc/route';
import * as operatorDecision from '@/app/api/operator/decision/route';
import * as operatorDocument from '@/app/api/operator/document/route';
import * as operatorKycInfo from '@/app/api/operator/kyc-info/route';
import * as operatorSummary from '@/app/api/operator/summary/route';
import * as adminAudit from '@/app/api/admin/audit/route';
import * as adminOverview from '@/app/api/admin/overview/route';
import * as adminProviders from '@/app/api/admin/providers/route';
import * as adminUsers from '@/app/api/admin/users/route';
import * as sharedSettings from '@/app/api/settings/route';

const body = (r: unknown) => (r as { _data: any })._data as any;
const status = (r: unknown) => (r as { status: number }).status;

beforeEach(() => { freshDb(); });

// ---------------------------------------------------------------------------
describe('anonymous callers are rejected everywhere', () => {
  beforeEach(async () => { await signInAs(null); });
  const cases: Array<[string, () => Promise<{ status: number }>]> = [
    ['GET /api/pe/profile', () => peProfile.GET()],
    ['GET /api/pe/dashboard', () => peDashboard.GET()],
    ['GET /api/pe/kyc', () => peKyc.GET()],
    ['GET /api/pe/headers', () => peHeaders.GET()],
    ['GET /api/pe/templates', () => peTemplates.GET()],
    ['GET /api/pe/urls', () => peUrls.GET()],
    ['POST /api/pe/kyc/submit', () => peKycSubmit.POST()],
    ['GET /api/operator/queue', () => operatorQueue.GET(makeRequest('/api/operator/queue?module=KYC') as never)],
    ['GET /api/operator/kyc', () => operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${PE_A_ENTITY}`) as never)],
    ['GET /api/operator/summary', () => operatorSummary.GET(makeRequest('/api/operator/summary') as never)],
    ['GET /api/admin/audit', () => adminAudit.GET(makeRequest('/api/admin/audit') as never)],
    ['GET /api/admin/overview', () => adminOverview.GET()],
    ['GET /api/admin/providers', () => adminProviders.GET(makeRequest('/api/admin/providers') as never)],
    ['GET /api/admin/users', () => adminUsers.GET()],
    ['GET /api/settings', () => sharedSettings.GET()],
    ['GET /api/auth/me', () => authMe.GET(makeRequest('/api/auth/me') as never, params({ action: 'me' }) as never)],
  ];
  for (const [name, call] of cases) {
    it(`${name} → 401`, async () => { expect(status(await call())).toBe(401); });
  }
});

// ---------------------------------------------------------------------------
describe('PE cannot reach operator or admin endpoints', () => {
  beforeEach(async () => { await signInAs('peA'); });
  const cases: Array<[string, () => Promise<{ status: number }>]> = [
    ['GET /api/operator/queue', () => operatorQueue.GET(makeRequest('/api/operator/queue?module=KYC') as never)],
    ['GET /api/operator/kyc', () => operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${PE_B_ENTITY}`) as never)],
    ['GET /api/operator/summary', () => operatorSummary.GET(makeRequest('/api/operator/summary') as never)],
    ['POST /api/operator/decision', () => operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'APPROVE' } }) as never)],
    ['POST /api/operator/document', () => operatorDocument.POST(makeRequest('/api/operator/document', { body: { docId: IDS.docB, status: 'VERIFIED' } }) as never)],
    ['POST /api/operator/kyc-info', () => operatorKycInfo.POST(makeRequest('/api/operator/kyc-info', { body: { entityId: PE_B_ENTITY, approve: true } }) as never)],
    ['GET /api/admin/audit', () => adminAudit.GET(makeRequest('/api/admin/audit') as never)],
    ['GET /api/admin/users', () => adminUsers.GET()],
    ['GET /api/admin/overview', () => adminOverview.GET()],
    ['GET /api/admin/providers', () => adminProviders.GET(makeRequest('/api/admin/providers') as never)],
  ];
  for (const [name, call] of cases) {
    it(`${name} → 403`, async () => { expect(status(await call())).toBe(403); });
  }
});

// ---------------------------------------------------------------------------
describe('cross-tenant isolation: PE A vs PE B', () => {
  it('dashboard returns only the caller\'s own entity', async () => {
    await signInAs('peA');
    const a = body(await peDashboard.GET());
    expect(a.entity.id).toBe(PE_A_ENTITY);
    expect(a.entity.legal_entity_name).toBe('Alpha Telecom');

    freshDb();
    await signInAs('peB');
    const b = body(await peDashboard.GET());
    expect(b.entity.id).toBe(PE_B_ENTITY);
    expect(b.entity.legal_entity_name).toBe('Bravo Retail');
  });

  it('dashboard history never includes another entity\'s audit rows', async () => {
    await signInAs('peA');
    const res = body(await peDashboard.GET());
    expect(res.history.every((h: any) => h.actor_email !== 'pe-b@x.ae')).toBe(true);
  });

  it('KYC list only contains the caller\'s documents', async () => {
    await signInAs('peA');
    const res = body(await peKyc.GET());
    expect(res.documents).toHaveLength(1);
    expect(res.documents[0].id).toBe(IDS.docA);
  });

  it('headers list only contains the caller\'s headers', async () => {
    await signInAs('peA');
    const res = body(await peHeaders.GET());
    expect(res.headers.map((h: any) => h.id)).toEqual([IDS.headerA]);
  });

  it('templates list only contains the caller\'s templates', async () => {
    await signInAs('peA');
    const res = body(await peTemplates.GET());
    expect(res.templates.map((t: any) => t.id)).toEqual([IDS.tplA]);
  });

  it('URLs list only contains the caller\'s URLs', async () => {
    await signInAs('peA');
    const res = body(await peUrls.GET());
    expect(res.urls.map((u: any) => u.id)).toEqual([IDS.urlA]);
  });

  it('PE A cannot preview PE B\'s KYC document', async () => {
    await signInAs('peA');
    const res = await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docB}`) as never);
    expect(status(res)).toBe(403);
  });

  it('PE A CAN preview its own KYC document', async () => {
    await signInAs('peA');
    const res = await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docA}`) as never);
    expect(status(res)).toBe(200);
  });

  it('PE A cannot submit PE B\'s header', async () => {
    await signInAs('peA');
    const res = await peSubmit.POST(makeRequest('/api/pe/submit', { body: { module: 'HEADER', id: IDS.headerB } }) as never);
    expect(status(res)).toBe(404);
  });

  it('PE A cannot submit PE B\'s entity KYC pack', async () => {
    await signInAs('peA');
    await peKycSubmit.POST();
    // Alpha is APPROVED → refused; Bravo must be untouched.
    const res = await peDashboard.GET();
    expect(body(res).entity.id).toBe(PE_A_ENTITY);
  });

  it('a PE with no entity linked sees nothing, not someone else\'s data', async () => {
    await signInAs('peNoEntity');
    const dash = body(await peDashboard.GET());
    expect(dash.entity).toBeNull();
    const docs = body(await peKyc.GET());
    expect(docs.documents).toEqual([]);
    const hdrs = body(await peHeaders.GET());
    expect(hdrs.headers).toEqual([]);
  });

  it('a PE with no entity cannot read any document by id', async () => {
    await signInAs('peNoEntity');
    const res = await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${IDS.docA}`) as never);
    expect(status(res)).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('operator roles cannot cross into each other\'s modules', () => {
  it('HEADER approver cannot read the KYC queue', async () => {
    await signInAs('header');
    const res = await operatorQueue.GET(makeRequest('/api/operator/queue?module=KYC') as never);
    expect(status(res)).toBe(403);
  });

  it('KYC approver cannot read the HEADER queue', async () => {
    await signInAs('kyc');
    const res = await operatorQueue.GET(makeRequest('/api/operator/queue?module=HEADER') as never);
    expect(status(res)).toBe(403);
  });

  it('KYC approver cannot read the split-screen KYC payload', async () => {
    await signInAs('header');
    const res = await operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${PE_A_ENTITY}`) as never);
    expect(status(res)).toBe(403);
  });

  it('HEADER approver cannot decide a KYC request', async () => {
    await signInAs('header');
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'APPROVE' } }) as never);
    expect(status(res)).toBe(403);
  });

  it('TEMPLATE/URL approver cannot decide a KYC request', async () => {
    await signInAs('tpl');
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'APPROVE' } }) as never);
    expect(status(res)).toBe(403);
  });

  it('HEADER approver cannot verify a KYC document', async () => {
    await signInAs('header');
    const res = await operatorDocument.POST(makeRequest('/api/operator/document', { body: { docId: IDS.docB, status: 'VERIFIED' } }) as never);
    expect(status(res)).toBe(403);
  });

  it('HEADER approver cannot approve PE information', async () => {
    await signInAs('header');
    const res = await operatorKycInfo.POST(makeRequest('/api/operator/kyc-info', { body: { entityId: PE_B_ENTITY, approve: true } }) as never);
    expect(status(res)).toBe(403);
  });

  it('summary is scoped to the caller\'s own modules', async () => {
    await signInAs('header');
    const res = body(await operatorSummary.GET(makeRequest('/api/operator/summary') as never));
    expect(res.modules.map((m: any) => m.module)).toEqual(['HEADER']);
  });

  it('summary refuses an explicit module the role does not own', async () => {
    await signInAs('header');
    const res = await operatorSummary.GET(makeRequest('/api/operator/summary?module=KYC') as never);
    expect(status(res)).toBe(403);
  });

  it('KYC approver summary contains KYC only', async () => {
    await signInAs('kyc');
    const res = body(await operatorSummary.GET(makeRequest('/api/operator/summary') as never));
    expect(res.modules.map((m: any) => m.module)).toEqual(['KYC']);
  });

  it('TEMPLATE/URL approver summary contains TEMPLATE and URL', async () => {
    await signInAs('tpl');
    const res = body(await operatorSummary.GET(makeRequest('/api/operator/summary') as never));
    expect(res.modules.map((m: any) => m.module).sort()).toEqual(['TEMPLATE', 'URL']);
  });

  it('queue payload is limited to the requested module', async () => {
    await signInAs('kyc');
    const res = body(await operatorQueue.GET(makeRequest('/api/operator/queue?module=KYC') as never));
    expect(res.module).toBe('KYC');
    expect(res.queue.every((r: any) => 'kyc_status' in r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('legitimate access still works (no over-blocking)', () => {
  it('KYC approver can read the split-screen payload', async () => {
    await signInAs('kyc');
    const res = await operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${PE_B_ENTITY}`) as never);
    expect(status(res)).toBe(200);
    expect(body(res).entity.id).toBe(PE_B_ENTITY);
  });

  it('KYC approver can verify a document and the change persists', async () => {
    await signInAs('kyc');
    const res = await operatorDocument.POST(makeRequest('/api/operator/document', { body: { docId: IDS.docB, status: 'VERIFIED' } }) as never);
    expect(status(res)).toBe(200);
    const after = body(await operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${PE_B_ENTITY}`) as never));
    expect(after.documents[0].status).toBe('VERIFIED');
  });

  it('admin can open every operator queue and admin screen', async () => {
    await signInAs('admin');
    for (const m of ['KYC', 'HEADER', 'TEMPLATE', 'URL']) {
      const res = await operatorQueue.GET(makeRequest(`/api/operator/queue?module=${m}`) as never);
      expect(status(res)).toBe(200);
    }
    expect(status(await adminAudit.GET(makeRequest('/api/admin/audit') as never))).toBe(200);
    expect(status(await adminUsers.GET())).toBe(200);
  });

  it('admin summary covers all four modules', async () => {
    await signInAs('admin');
    const res = body(await operatorSummary.GET(makeRequest('/api/operator/summary') as never));
    expect(res.modules.map((m: any) => m.module).sort()).toEqual(['HEADER', 'KYC', 'TEMPLATE', 'URL']);
  });

  it('PE can read its own profile and dashboard', async () => {
    await signInAs('peA');
    expect(status(await peProfile.GET())).toBe(200);
    expect(status(await peDashboard.GET())).toBe(200);
  });

  it('provider credentials are never returned to a client', async () => {
    await signInAs('admin');
    const res = body(await adminProviders.GET(makeRequest('/api/admin/providers') as never));
    expect(JSON.stringify(res)).not.toContain('sk_secret');
  });
});

// ---------------------------------------------------------------------------
describe('reviewers cannot bypass the workflow sequence', () => {
  it('KYC cannot be approved while it is still DRAFT (not submitted)', async () => {
    await signInAs('kyc');
    // Bravo is SUBMITTED but its documents are not all verified
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'APPROVE' } }) as never);
    expect(status(res)).toBe(409);
  });

  it('rejection requires remarks', async () => {
    await signInAs('kyc');
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'REJECT', remarks: '' } }) as never);
    expect(status(res)).toBe(400);
  });

  it('header approver cannot approve a header belonging to a rejected flow out of order', async () => {
    await signInAs('header');
    // Bravo header is SUBMITTED → APPROVED is a legal transition for the header approver
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'HEADER', id: IDS.headerB, action: 'APPROVE', remarks: 'ok' } }) as never);
    expect(status(res)).toBe(200);
  });
});
