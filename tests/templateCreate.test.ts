/**
 * SMS template creation: the channel is fixed to SMS, variables come from the
 * body in <varN> form, and every declared variable needs sample content.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, signInAs, makeRequest, IDS } from './helpers/harness';
import * as peTemplates from '@/app/api/pe/templates/route';
import * as operatorQueue from '@/app/api/operator/queue/route';

const body = (r: unknown) => (r as { _data: any })._data;
const status = (r: unknown) => (r as { status: number }).status;

beforeEach(() => { freshDb(); });

describe('template creation', () => {
  it('rejects a {{name}} body — variables use the <varN> format', async () => {
    await signInAs('peA');
    const res = await peTemplates.POST(makeRequest('/api/pe/templates', {
      body: { header_id: IDS.headerA, template_name: 'Bad', body: 'Dear {{name}}, hi', variable_samples: {} },
    }) as never);
    expect(status(res)).toBe(400);
    expect(JSON.stringify(body(res).errors)).toContain('var1');
  });

  it('requires sample content for every declared variable', async () => {
    await signInAs('peA');
    const res = await peTemplates.POST(makeRequest('/api/pe/templates', {
      body: { header_id: IDS.headerA, template_name: 'No samples', body: 'Dear <var1>, order <var2> ready', variable_samples: { var1: 'Puneet' } },
    }) as never);
    expect(status(res)).toBe(400);
    expect(JSON.stringify(body(res).errors)).toContain('var2');
  });

  it('ignores a channel the client tries to force to EMAIL', async () => {
    await signInAs('peA');
    const res = await peTemplates.POST(makeRequest('/api/pe/templates', {
      body: { header_id: IDS.headerA, template_name: 'Forced', channel: 'EMAIL', body: 'Plain body text', variable_samples: {} },
    }) as never);
    expect(status(res)).toBe(400);
    expect(JSON.stringify(body(res).errors)).toContain('channel');
  });

  it('creates the template as SMS with derived variables and sample content', async () => {
    await signInAs('peA');
    const res = await peTemplates.POST(makeRequest('/api/pe/templates', {
      body: {
        header_id: IDS.headerA, template_name: 'Order ready', category: 'TRANSACTIONAL',
        body: 'Dear <var1>, your order <var2> is ready.',
        variable_samples: { var1: 'Puneet Bhargava', var2: 'ORD-44712' },
      },
    }) as never);
    expect(status(res), JSON.stringify(body(res))).toBe(200);
    const t = body(res).template;
    expect(t.channel).toBe('SMS');
    expect(t.variables).toBe('var1,var2');
    expect(t.variable_samples).toEqual({ var1: 'Puneet Bhargava', var2: 'ORD-44712' });
    expect(t.status).toBe('DRAFT');
  });

  it('will not register a template against another entity\'s header', async () => {
    await signInAs('peA');
    const res = await peTemplates.POST(makeRequest('/api/pe/templates', {
      body: { header_id: IDS.headerB, template_name: 'Cross', body: 'Plain body text', variable_samples: {} },
    }) as never);
    expect(status(res)).toBe(409);
  });
});

describe('sample content can be defined after creation', () => {
  it('frozen once the template is approved', async () => {
    await signInAs('peA');
    const res = await peTemplates.PATCH(makeRequest('/api/pe/templates', {
      body: { id: IDS.tplA, variable_samples: { var1: 'Changed', var2: 'ORD-1' } },
    }) as never);
    expect(status(res)).toBe(409);
  });

  it('refuses a template the caller does not own', async () => {
    await signInAs('peA');
    const res = await peTemplates.PATCH(makeRequest('/api/pe/templates', {
      body: { id: 'tpl-not-mine', variable_samples: { var1: 'x' } },
    }) as never);
    expect(status(res)).toBe(404);
  });

  it('anonymous callers cannot patch samples', async () => {
    await signInAs(null);
    const res = await peTemplates.PATCH(makeRequest('/api/pe/templates', {
      body: { id: IDS.tplA, variable_samples: { var1: 'x' } },
    }) as never);
    expect(status(res)).toBe(401);
  });
});

describe('the approver sees the body and sample content', () => {
  it('the template queue carries body, variables and samples', async () => {
    await signInAs('tpl');
    const res = body(await operatorQueue.GET(makeRequest('/api/operator/queue?module=TEMPLATE') as never));
    const row = res.queue[0];
    expect(row.body).toBe('Dear <var1>, your order <var2> is ready.');
    expect(row.variables).toBe('var1,var2');
    expect(row.variable_samples).toEqual({ var1: 'Puneet', var2: 'ORD-44712' });
    expect(row.channel).toBe('SMS');
  });
});
