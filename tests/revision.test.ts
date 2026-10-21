/**
 * Correction round-trip: a record returned by a reviewer (or rejected) must be
 * editable by the enterprise, and only then. Records under review or approved
 * are frozen. Covers header, template and URL.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { signInAs, makeRequest, PE_A_ENTITY, PE_B_ENTITY, IDS } from './helpers/harness';
import { resetDb } from './helpers/mockDb';
import { seed } from './helpers/seed';
import * as peHeaders from '@/app/api/pe/headers/route';
import * as peTemplates from '@/app/api/pe/templates/route';
import * as peUrls from '@/app/api/pe/urls/route';

const status = (r: unknown) => (r as { status: number }).status;
const body = (r: unknown) => (r as { _data: any })._data;
const TPL_B = '55555555-5555-4555-8555-555555555555';
const URL_B = '66666666-6666-4666-8666-666666666666';

function withStatus() {
  const t = seed();
  // Alpha's header is APPROVED in the fixture; give it a correction record.
  t.header_registrations = [
    ...t.header_registrations,
    { id: 'aaaaaaaa-1111-4111-8111-111111111111', header_code: 'HDR-900001', entity_id: PE_A_ENTITY,
      header_name: 'Needs fixing', sender_id: 'FIXME', header_type: 'ALPHANUMERIC',
      status: 'CLARIFICATION_REQUIRED', remarks: 'sender id already taken',
      created_by: IDS.peAUser, created_at: '2026-02-01T00:00:00Z' },
    { id: 'aaaaaaaa-2222-4222-8222-222222222222', header_code: 'HDR-900002', entity_id: PE_A_ENTITY,
      header_name: 'In review', sender_id: 'WAIT', header_type: 'ALPHANUMERIC',
      status: 'SUBMITTED', remarks: null, created_by: IDS.peAUser, created_at: '2026-02-02T00:00:00Z' },
  ];
  t.template_registrations = [
    ...t.template_registrations,
    { id: TPL_B, template_code: 'TPL-9000001', entity_id: PE_A_ENTITY, header_id: IDS.headerA,
      template_name: 'Needs fixing', category: 'TRANSACTIONAL', channel: 'SMS',
      body: 'Dear <var1>, hi', variables: 'var1', variable_samples: { var1: 'Old' },
      status: 'CLARIFICATION_REQUIRED', remarks: 'wrong greeting',
      created_by: IDS.peAUser, created_at: '2026-02-03T00:00:00Z' },
  ];
  t.url_registrations = [
    ...t.url_registrations,
    { id: URL_B, url_code: 'URL-90000', entity_id: PE_A_ENTITY, template_id: IDS.tplA,
      url: 'https://old.example/cb', method: 'POST', callback_type: 'DLT',
      status: 'CLARIFICATION_REQUIRED', remarks: 'wrong endpoint',
      created_by: IDS.peAUser, created_at: '2026-02-04T00:00:00Z' },
  ];
  return t;
}

beforeEach(() => { resetDb(withStatus()); });

describe('header: editable after a correction', () => {
  it('saves the changed values', async () => {
    await signInAs('peA');
    const res = await peHeaders.PUT(makeRequest('/api/pe/headers', {
      body: { id: 'aaaaaaaa-1111-4111-8111-111111111111', header_name: 'Fixed name', sender_id: 'FIXED', header_type: 'ALPHANUMERIC' },
    }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).header.header_name).toBe('Fixed name');
    expect(body(res).header.sender_id).toBe('FIXED');
    expect(body(res).header.status).toBe('CLARIFICATION_REQUIRED');
  });

  it('rejects an invalid sender id', async () => {
    await signInAs('peA');
    const res = await peHeaders.PUT(makeRequest('/api/pe/headers', {
      body: { id: 'aaaaaaaa-1111-4111-8111-111111111111', header_name: 'Ok', sender_id: 'no spaces allowed', header_type: 'ALPHANUMERIC' },
    }) as never);
    expect(status(res)).toBe(400);
  });

  it('refuses a header that is under review', async () => {
    await signInAs('peA');
    const res = await peHeaders.PUT(makeRequest('/api/pe/headers', {
      body: { id: 'aaaaaaaa-2222-4222-8222-222222222222', header_name: 'Sneaky', sender_id: 'SNEAK', header_type: 'ALPHANUMERIC' },
    }) as never);
    expect(status(res)).toBe(409);
    expect(body(res).error).toContain('under review');
  });

  it('refuses another entity\'s header', async () => {
    await signInAs('peA');
    const res = await peHeaders.PUT(makeRequest('/api/pe/headers', {
      body: { id: IDS.headerB, header_name: 'Cross', sender_id: 'CROSS', header_type: 'ALPHANUMERIC' },
    }) as never);
    expect(status(res)).toBe(404);
  });
});

describe('template: editable after a correction', () => {
  it('saves body, name and recalculated variables + samples', async () => {
    await signInAs('peA');
    const res = await peTemplates.PUT(makeRequest('/api/pe/templates', {
      body: {
        id: TPL_B, template_name: 'Fixed template', category: 'OTP',
        body: 'Hello <var1>, code <var2>',
        variable_samples: { var1: 'Mariam', var2: '123456' },
      },
    }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).template.body).toBe('Hello <var1>, code <var2>');
    expect(body(res).template.variables).toBe('var1,var2');
    expect(body(res).template.variable_samples).toEqual({ var1: 'Mariam', var2: '123456' });
    expect(body(res).template.status).toBe('CLARIFICATION_REQUIRED');
  });

  it('still enforces sample content per variable', async () => {
    await signInAs('peA');
    const res = await peTemplates.PUT(makeRequest('/api/pe/templates', {
      body: { id: TPL_B, template_name: 'X', category: 'OTP', body: 'Hi <var1> and <var2>', variable_samples: { var1: 'a' } },
    }) as never);
    expect(status(res)).toBe(400);
    expect(JSON.stringify(body(res).errors)).toContain('var2');
  });

  it('still rejects a {{name}} body', async () => {
    await signInAs('peA');
    const res = await peTemplates.PUT(makeRequest('/api/pe/templates', {
      body: { id: TPL_B, template_name: 'X', category: 'OTP', body: 'Hi {{name}}', variable_samples: {} },
    }) as never);
    expect(status(res)).toBe(400);
  });

  it('refuses an approved template', async () => {
    await signInAs('peA');
    const res = await peTemplates.PUT(makeRequest('/api/pe/templates', {
      body: { id: IDS.tplA, template_name: 'Changed', category: 'OTP', body: 'Hi <var1>', variable_samples: { var1: 'a' } },
    }) as never);
    expect(status(res)).toBe(409);
  });
});

describe('URL: editable after a correction', () => {
  it('saves the changed endpoint', async () => {
    await signInAs('peA');
    const res = await peUrls.PUT(makeRequest('/api/pe/urls', {
      body: { id: URL_B, url: 'https://new.example/cb', method: 'GET', callback_type: 'DLT' },
    }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    expect(body(res).url.url).toBe('https://new.example/cb');
    expect(body(res).url.method).toBe('GET');
  });

  it('rejects a malformed URL', async () => {
    await signInAs('peA');
    const res = await peUrls.PUT(makeRequest('/api/pe/urls', { body: { id: URL_B, url: 'not-a-url' } }) as never);
    expect(status(res)).toBe(400);
  });

  it('will not re-point to an unapproved template', async () => {
    await signInAs('peA');
    const res = await peUrls.PUT(makeRequest('/api/pe/urls', {
      body: { id: URL_B, url: 'https://ok.example/cb', template_id: TPL_B },
    }) as never);
    expect(status(res)).toBe(409);
  });
});

describe('edit rights do not leak across roles or tenants', () => {
  it('a reviewer cannot edit', async () => {
    await signInAs('kyc');
    expect(status(await peHeaders.PUT(makeRequest('/api/pe/headers', { body: { id: 'aaaaaaaa-1111-4111-8111-111111111111', header_name: 'x', sender_id: 'ABC' } }) as never))).toBe(403);
  });

  it('another enterprise cannot edit it', async () => {
    await signInAs('peB');
    const res = await peHeaders.PUT(makeRequest('/api/pe/headers', {
      body: { id: 'aaaaaaaa-1111-4111-8111-111111111111', header_name: 'x', sender_id: 'ABC' },
    }) as never);
    expect(status(res)).toBe(404);
  });

  it('anonymous cannot edit', async () => {
    await signInAs(null);
    expect(status(await peUrls.PUT(makeRequest('/api/pe/urls', { body: { id: URL_B, url: 'https://x.example/cb' } }) as never))).toBe(401);
  });
});
