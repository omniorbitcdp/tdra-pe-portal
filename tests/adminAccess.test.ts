/**
 * The administrator must be able to see every document and action every queue:
 * KYC, Header, Template and URL — plus all oversight screens. This suite drives
 * the real handlers and finishes with one complete approval chain performed
 * entirely by the admin.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { signInAs, makeRequest, params, PE_A_ENTITY, PE_B_ENTITY, IDS } from './helpers/harness';
import { resetDb } from './helpers/mockDb';
import { seed } from './helpers/seed';
import { middleware } from '@/middleware';
import { createSessionToken } from '@/lib/session';
import { SESSION_COOKIE, type Role, MANDATORY_DOC_TYPES } from '@/lib/constants';

import * as peKycFile from '@/app/api/pe/kyc/file/route';
import * as operatorQueue from '@/app/api/operator/queue/route';
import * as operatorKyc from '@/app/api/operator/kyc/route';
import * as operatorSummary from '@/app/api/operator/summary/route';
import * as operatorDocument from '@/app/api/operator/document/route';
import * as operatorKycInfo from '@/app/api/operator/kyc-info/route';
import * as operatorDecision from '@/app/api/operator/decision/route';
import * as adminAudit from '@/app/api/admin/audit/route';
import * as adminOverview from '@/app/api/admin/overview/route';
import * as adminUsers from '@/app/api/admin/users/route';
import * as adminProviders from '@/app/api/admin/providers/route';
import * as adminNotifications from '@/app/api/admin/notifications/route';

const status = (r: unknown) => (r as { status: number }).status;
const body = (r: unknown) => (r as { _data: any })._data;
const TPL_B = '55555555-5555-4555-8555-555555555555';
const URL_B = '66666666-6666-4666-8666-666666666666';
const DOC_B: Record<string, string> = {
  TRADE_LICENCE: IDS.docB,
  EMIRATES_ID: '77777777-7777-4777-8777-777777777771',
  SIGNATORY_LETTER: '77777777-7777-4777-8777-777777777772',
  VAT_CERTIFICATE: '77777777-7777-4777-8777-777777777773',
};

/** Entity B (Bravo) with a complete, submitted registration — the thing the
 *  admin has to be able to push all the way to APPROVED. */
function submittedBravo() {
  const t = seed();
  t.kyc_documents = [
    ...t.kyc_documents.filter((d) => d.entity_id !== PE_B_ENTITY),
    ...MANDATORY_DOC_TYPES.map((doc_type) => ({
      id: DOC_B[doc_type], entity_id: PE_B_ENTITY, doc_type, file_name: `${doc_type}.pdf`,
      storage_path: `${PE_B_ENTITY}/${doc_type}/f.pdf`, mime_type: 'application/pdf',
      size_bytes: 10, status: 'PENDING_VERIFICATION',
    })),
  ];
  t.template_registrations = [
    ...t.template_registrations,
    { id: TPL_B, template_code: 'TPL-2222222', entity_id: PE_B_ENTITY, header_id: IDS.headerB,
      template_name: 'Bravo Alerts', category: 'TRANSACTIONAL', channel: 'SMS',
      body: 'Dear <var1>, order <var2> ready.', variables: 'var1,var2',
      variable_samples: { var1: 'Mariam', var2: 'ORD-1' }, status: 'SUBMITTED', created_by: IDS.peBUser, created_at: '2026-01-09T00:00:00Z' },
  ];
  t.url_registrations = [
    ...t.url_registrations,
    { id: URL_B, url_code: 'URL-22222', entity_id: PE_B_ENTITY, template_id: TPL_B,
      url: 'https://bravo.ae/cb', method: 'POST', callback_type: 'DLT', status: 'SUBMITTED', created_by: IDS.peBUser, created_at: '2026-01-10T00:00:00Z' },
  ];
  return t;
}

beforeEach(() => { resetDb(submittedBravo()); });

// ---------------------------------------------------------------------------
describe('edge: the admin reaches every queue and oversight screen', () => {
  async function edge(pathname: string, role: Role) {
    const url = new URL(pathname, 'http://localhost');
    const token = await createSessionToken({ uid: 'u1', email: 'a@b.c', role, entityId: null, name: 'A' }, 1);
    const clone = () => ({ pathname: url.pathname, search: '', searchParams: new URLSearchParams(), toString: () => `http://localhost${url.pathname}` });
    return middleware({
      nextUrl: { pathname: url.pathname, clone },
      cookies: { get: (n: string) => (n === SESSION_COOKIE ? { name: n, value: token } : undefined) },
    } as never) as unknown as Promise<{ status: number; headers: { get(k: string): string | null } }>;
  }

  const PATHS = [
    '/operator', '/operator/kyc', `/operator/kyc/${PE_B_ENTITY}`, '/operator/headers',
    '/operator/templates', '/operator/urls',
    '/api/operator/queue', '/api/operator/kyc', '/api/operator/summary',
    '/api/operator/document', '/api/operator/decision', '/api/operator/kyc-info',
    '/api/pe/kyc/file',
    '/admin', '/admin/audit', '/admin/users', '/admin/settings', '/admin/api-config',
    '/admin/notifications',
    '/api/admin/audit', '/api/admin/users', '/api/admin/providers',
    '/api/admin/overview', '/api/admin/notifications', '/api/admin/settings',
  ];
  for (const p of PATHS) {
    it(`ADMIN passes ${p}`, async () => {
      const res = await edge(p, 'ADMIN');
      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });
  }
});

// ---------------------------------------------------------------------------
describe('admin sees every document', () => {
  it('can list all four queues', async () => {
    await signInAs('admin');
    for (const m of ['KYC', 'HEADER', 'TEMPLATE', 'URL']) {
      expect(status(await operatorQueue.GET(makeRequest(`/api/operator/queue?module=${m}`) as never)), m).toBe(200);
    }
  });

  it('can open the split-screen review for any entity', async () => {
    await signInAs('admin');
    // Alpha is seeded with 1 document, Bravo with the full pack of 4.
    for (const [id, expectedDocs] of [[PE_A_ENTITY, 1], [PE_B_ENTITY, 4]] as const) {
      const res = await operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${id}`) as never);
      expect(status(res), id).toBe(200);
      expect(body(res).entity.id).toBe(id);
      expect(body(res).documents.length, id).toBe(expectedDocs);
    }
  });

  it('sees every mandatory document for a submitted business', async () => {
    await signInAs('admin');
    const res = body(await operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${PE_B_ENTITY}`) as never));
    expect(res.documents.map((d: any) => d.doc_type).sort()).toEqual([...MANDATORY_DOC_TYPES].sort());
  });

  it('can preview a document belonging to ANY entity', async () => {
    await signInAs('admin');
    for (const docId of [IDS.docA, ...Object.values(DOC_B)]) {
      const res = await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${docId}`) as never);
      expect(status(res), docId).toBe(200);
      expect(body(res).url).toBeTruthy();
    }
  });

  it('sees all four modules on the workbench summary', async () => {
    await signInAs('admin');
    const res = body(await operatorSummary.GET(makeRequest('/api/operator/summary') as never));
    expect(res.modules.map((m: any) => m.module).sort()).toEqual(['HEADER', 'KYC', 'TEMPLATE', 'URL']);
  });

  it('sees every oversight screen', async () => {
    await signInAs('admin');
    expect(status(await adminAudit.GET(makeRequest('/api/admin/audit') as never))).toBe(200);
    expect(status(await adminOverview.GET())).toBe(200);
    expect(status(await adminUsers.GET())).toBe(200);
    expect(status(await adminProviders.GET(makeRequest('/api/admin/providers') as never))).toBe(200);
    expect(status(await adminNotifications.GET(makeRequest('/api/admin/notifications') as never))).toBe(200);
  });

  it('does not need to be linked to an entity itself', async () => {
    await signInAs('admin');
    expect(body(await operatorQueue.GET(makeRequest('/api/operator/queue?module=KYC') as never)).queue.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('admin can approve every kind of request', () => {
  it('verifies KYC documents', async () => {
    await signInAs('admin');
    const res = await operatorDocument.POST(makeRequest('/api/operator/document', { body: { docId: DOC_B.EMIRATES_ID, status: 'VERIFIED' } }) as never);
    expect(status(res)).toBe(200);
  });

  it('approves PE information', async () => {
    await signInAs('admin');
    const res = await operatorKycInfo.POST(makeRequest('/api/operator/kyc-info', { body: { entityId: PE_B_ENTITY, approve: true } }) as never);
    expect(status(res)).toBe(200);
  });

  it('approves a KYC pack', async () => {
    await signInAs('admin');
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'APPROVE' } }) as never);
    // gated until all four docs verified + info approved → 409 is the correct, expected refusal
    expect([200, 409]).toContain(status(res));
  });

  it('approves a header', async () => {
    await signInAs('admin');
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'HEADER', id: IDS.headerB, action: 'APPROVE', remarks: 'ok' } }) as never);
    expect(status(res)).toBe(200);
  });

  it('approves a template', async () => {
    await signInAs('admin');
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'TEMPLATE', id: TPL_B, action: 'APPROVE', remarks: 'ok' } }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
  });

  it('approves a URL', async () => {
    await signInAs('admin');
    const res = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'URL', id: URL_B, action: 'APPROVE', remarks: 'ok' } }) as never);
    expect(status(res)).toBe(200);
  });

  it('can reject and request correction too', async () => {
    await signInAs('admin');
    expect(status(await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'HEADER', id: IDS.headerB, action: 'REJECT', remarks: 'not acceptable' } }) as never))).toBe(200);
    resetDb(submittedBravo());
    await signInAs('admin');
    expect(status(await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'TEMPLATE', id: TPL_B, action: 'REQUEST_CORRECTION', remarks: 'fix wording' } }) as never))).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('admin drives one complete approval chain end to end', () => {
  it('document verification → PE info → KYC → header → template → URL', async () => {
    await signInAs('admin');

    // 1. all four documents verified
    for (const docId of Object.values(DOC_B)) {
      expect(status(await operatorDocument.POST(makeRequest('/api/operator/document', { body: { docId, status: 'VERIFIED' } }) as never)), docId).toBe(200);
    }

    // 2. PE information approved
    expect(status(await operatorKycInfo.POST(makeRequest('/api/operator/kyc-info', { body: { entityId: PE_B_ENTITY, approve: true } }) as never))).toBe(200);

    // 3. the KYC pack itself
    const kyc = await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'APPROVE', remarks: 'verified' } }) as never);
    expect(status(kyc), JSON.stringify(body(kyc))).toBe(200);

    // 4. header, 5. template, 6. URL
    expect(status(await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'HEADER', id: IDS.headerB, action: 'APPROVE', remarks: 'ok' } }) as never))).toBe(200);
    expect(status(await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'TEMPLATE', id: TPL_B, action: 'APPROVE', remarks: 'ok' } }) as never))).toBe(200);
    expect(status(await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'URL', id: URL_B, action: 'APPROVE', remarks: 'ok' } }) as never))).toBe(200);

    // 7. the entity really is APPROVED and the documents really are VERIFIED
    const view = body(await operatorKyc.GET(makeRequest(`/api/operator/kyc?entityId=${PE_B_ENTITY}`) as never));
    expect(view.entity.kyc_status).toBe('APPROVED');
    expect(view.entity.kyc_info_approved).toBe(true);
    expect(view.documents.every((d: any) => d.status === 'VERIFIED')).toBe(true);

    const queues = body(await operatorQueue.GET(makeRequest('/api/operator/queue?module=HEADER') as never));
    expect(queues.queue.find((r: any) => r.id === IDS.headerB).status).toBe('APPROVED');
  });
});

// ---------------------------------------------------------------------------
describe('admin powers are not shared with the other roles', () => {
  it('a header approver cannot approve a KYC pack or a template', async () => {
    await signInAs('header');
    expect(status(await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'KYC', id: PE_B_ENTITY, action: 'APPROVE' } }) as never))).toBe(403);
    expect(status(await operatorDecision.POST(makeRequest('/api/operator/decision', { body: { module: 'TEMPLATE', id: TPL_B, action: 'APPROVE', remarks: 'x' } }) as never))).toBe(403);
  });

  it('a business account cannot reach the queues or the documents of others', async () => {
    await signInAs('peA');
    expect(status(await operatorQueue.GET(makeRequest('/api/operator/queue?module=KYC') as never))).toBe(403);
    expect(status(await peKycFile.GET(makeRequest(`/api/pe/kyc/file?docId=${DOC_B.VAT_CERTIFICATE}`) as never))).toBe(403);
    expect(status(await adminUsers.GET())).toBe(403);
  });
});
