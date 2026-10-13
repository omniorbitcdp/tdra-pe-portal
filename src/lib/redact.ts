// Redaction helpers. Provider credentials must never reach the browser, the
// notification log or an audit entry (requirements §10, §11).

export const SECRET_AUTH_KEYS = ['token', 'password', 'key_value'] as const;
/** Mask used in place of a stored secret when returning config to a client. */
export const SECRET_MASK = '__SET__';

const AUTH_HEADERS = ['authorization', 'x-api-key', 'api-key', 'apikey', 'auth-token', 'cookie', 'set-cookie'];
const SENSITIVE_VAR_KEYS = ['token', 'link', 'url', 'otp', 'password', 'secret', 'code'];

/** Remove/blank credential-bearing headers from a request preview. */
export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    out[k] = AUTH_HEADERS.includes(k.toLowerCase()) ? '«redacted»' : v;
  }
  return out;
}

/** Mask secret values inside an auth_config object (for client responses). */
export function maskAuthConfig(authConfig: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = { ...(authConfig ?? {}) };
  for (const key of SECRET_AUTH_KEYS) {
    if (out[key]) out[key] = SECRET_MASK;
  }
  return out;
}

/**
 * Merge incoming auth_config with the stored one: a value equal to SECRET_MASK
 * means "unchanged", so we keep whatever is already stored. Prevents the UI
 * from ever needing to round-trip the real secret.
 */
export function mergeAuthConfig(
  incoming: Record<string, string> | undefined,
  existing: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming ?? {})) {
    if (v === SECRET_MASK && existing?.[k]) out[k] = existing[k];
    else if (v !== SECRET_MASK) out[k] = v;
  }
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (!(k in out) && SECRET_AUTH_KEYS.includes(k as never)) out[k] = v;
  }
  return out;
}

/** Strip secret-bearing values out of template variables before logging. */
export function redactVars(vars: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars ?? {})) {
    out[k] = SENSITIVE_VAR_KEYS.some((s) => k.toLowerCase().includes(s)) ? '«redacted»' : v;
  }
  return out;
}

/** A whole request preview, safe to return to a client or persist. */
export function redactRequestPreview<T extends { headers?: Record<string, string> }>(preview: T): T {
  return { ...preview, headers: redactHeaders(preview.headers) };
}
