import { describe, it, expect } from 'vitest';
import { redactHeaders, maskAuthConfig, mergeAuthConfig, redactVars, redactRequestPreview, SECRET_MASK } from '@/lib/redact';

describe('secret redaction', () => {
  it('blanks credential-bearing headers but keeps the rest', () => {
    const out = redactHeaders({ Authorization: 'Bearer sk_live_123', 'Content-Type': 'application/json', 'X-Api-Key': 'k' });
    expect(out.Authorization).toBe('«redacted»');
    expect(out['X-Api-Key']).toBe('«redacted»');
    expect(out['Content-Type']).toBe('application/json');
  });

  it('masks only secret keys in auth_config', () => {
    const out = maskAuthConfig({ token: 'sk_live', key_name: 'X-Api-Key', key_in: 'header' });
    expect(out.token).toBe(SECRET_MASK);
    expect(out.key_name).toBe('X-Api-Key');
    expect(out.key_in).toBe('header');
  });

  it('keeps the stored secret when the client sends the mask back', () => {
    const merged = mergeAuthConfig({ token: SECRET_MASK, key_name: 'X-New' }, { token: 'sk_stored', key_name: 'X-Old' });
    expect(merged.token).toBe('sk_stored');
    expect(merged.key_name).toBe('X-New');
  });

  it('accepts a genuinely new secret', () => {
    expect(mergeAuthConfig({ token: 'sk_new' }, { token: 'sk_old' }).token).toBe('sk_new');
  });

  it('drops an all-mask config for a brand-new provider (no stored value)', () => {
    expect(mergeAuthConfig({ token: SECRET_MASK }, {}).token).toBeUndefined();
  });

  it('redacts tokens, links and OTPs from logged variables', () => {
    const out = redactVars({ recipient: '+971500000000', link: 'https://x/activate?token=abc', otp: '123456', subject: 'Hi' });
    expect(out.recipient).toBe('+971500000000');
    expect(out.subject).toBe('Hi');
    expect(out.link).toBe('«redacted»');
    expect(out.otp).toBe('«redacted»');
  });

  it('redacts a whole request preview', () => {
    const out = redactRequestPreview({ url: 'https://api.x/y', method: 'POST', headers: { Authorization: 'Bearer z' } });
    expect(out.headers.Authorization).toBe('«redacted»');
    expect(out.url).toBe('https://api.x/y');
  });
});
