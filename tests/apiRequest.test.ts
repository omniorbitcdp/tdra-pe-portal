import { describe, it, expect, vi } from 'vitest';
import { renderTemplate, buildRequest, executeRequest, type ProviderRequestConfig } from '@/lib/apiRequest';

const base: ProviderRequestConfig = {
  channel: 'SMS', provider_name: 'test', base_url: 'https://api.example.com/v1/messages', http_method: 'POST',
  headers: { 'Content-Type': 'application/json' }, query_params: {},
  body_template: '{"to":"{{recipient}}","message":"{{body}}"}', auth_type: 'BEARER', auth_config: { token: 'tok_123' },
};

describe('renderTemplate', () => {
  it('substitutes variables and leaves unknown tokens intact', () => {
    expect(renderTemplate('Hi {{name}}, code {{otp}}', { name: 'Sam', otp: '42' })).toBe('Hi Sam, code 42');
    expect(renderTemplate('{{missing}}', {})).toBe('{{missing}}');
  });
});

describe('buildRequest', () => {
  it('applies bearer auth and renders the body', () => {
    const r = buildRequest(base, { recipient: '+971500000000', body: 'hello' });
    expect(r.headers['Authorization']).toBe('Bearer tok_123');
    expect(r.body).toContain('+971500000000');
    expect(r.method).toBe('POST');
  });
  it('applies API key auth in a header or query param', () => {
    const h = buildRequest({ ...base, auth_type: 'API_KEY', auth_config: { key_name: 'X-Api-Key', key_value: 'k1', key_in: 'header' } }, {});
    expect(h.headers['X-Api-Key']).toBe('k1');
    const q = buildRequest({ ...base, auth_type: 'API_KEY', auth_config: { key_name: 'api_key', key_value: 'k2', key_in: 'query' } }, {});
    expect(q.url).toContain('api_key=k2');
  });
  it('applies basic auth as base64', () => {
    const r = buildRequest({ ...base, auth_type: 'BASIC', auth_config: { username: 'u', password: 'p' } }, {});
    expect(r.headers['Authorization']).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
  });
  it('omits the body for GET and renders query params', () => {
    const r = buildRequest({ ...base, http_method: 'GET', query_params: { to: '{{recipient}}' } }, { recipient: 'X' });
    expect(r.body).toBeUndefined();
    expect(r.url).toContain('to=X');
  });
});

describe('executeRequest (mocked fetch)', () => {
  it('returns a structured success result', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message_id: 'abc' }), { status: 200, headers: { 'x-req-id': '1' } }));
    const res = await executeRequest(base, { recipient: 'X', body: 'y' }, fetchMock as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.responseBody).toContain('abc');
    expect(res.requestPreview.method).toBe('POST');
  });

  it('captures non-2xx responses as not ok', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    const res = await executeRequest(base, {}, fetchMock as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
  });

  it('handles network errors gracefully', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down'); });
    const res = await executeRequest(base, {}, fetchMock as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('network down');
  });

  it('honours the timeout', async () => {
    const fetchMock = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const res = await executeRequest({ ...base, timeout_ms: 30 }, {}, fetchMock as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('timed out');
  });

  it('reports an invalid configuration instead of throwing', async () => {
    const res = await executeRequest({ ...base, base_url: 'not a url' }, {}, vi.fn() as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Invalid configuration');
  });
});
