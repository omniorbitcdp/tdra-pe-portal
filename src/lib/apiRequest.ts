// Provider-agnostic outbound HTTP engine backing the Postman-style API config
// screens and the notification service. Pure + injectable fetch => unit-testable.
import type { Channel } from './constants';

export interface ProviderRequestConfig {
  channel: Channel;
  provider_name: string;
  base_url: string;
  http_method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  query_params: Record<string, string>;
  body_template: string | null;
  auth_type: 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY';
  auth_config: Record<string, string>;
  timeout_ms?: number;
}

export type Vars = Record<string, string | number | undefined | null>;

/** Replace {{token}} occurrences with provided variables. Unknown tokens are
 *  left untouched so config errors are visible rather than silently blanked. */
export function renderTemplate(tpl: string | null | undefined, vars: Vars): string {
  if (!tpl) return '';
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? m : String(v);
  });
}

export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export function buildRequest(config: ProviderRequestConfig, vars: Vars): BuiltRequest {
  const url = new URL(renderTemplate(config.base_url, vars));
  const query = { ...(config.query_params ?? {}) };
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, renderTemplate(v, vars));
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(config.headers ?? {})) {
    headers[k] = renderTemplate(v, vars);
  }

  // Auth application
  const ac = config.auth_config ?? {};
  if (config.auth_type === 'BEARER' && ac.token) {
    headers['Authorization'] = `Bearer ${ac.token}`;
  } else if (config.auth_type === 'BASIC') {
    const raw = `${ac.username ?? ''}:${ac.password ?? ''}`;
    headers['Authorization'] = `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
  } else if (config.auth_type === 'API_KEY' && ac.key_name) {
    if ((ac.key_in ?? 'header') === 'query') url.searchParams.set(ac.key_name, ac.key_value ?? '');
    else headers[ac.key_name] = ac.key_value ?? '';
  }

  const method = config.http_method.toUpperCase();
  const hasBody = method !== 'GET' && !!config.body_template && config.body_template.trim() !== '';
  const body = hasBody ? renderTemplate(config.body_template, vars) : undefined;

  return { url: url.toString(), method, headers, body };
}

export interface ExecuteResult {
  ok: boolean;
  status: number | null;
  timeMs: number;
  requestPreview: BuiltRequest;
  responseBody: string;
  responseHeaders: Record<string, string>;
  error?: string;
}

export async function executeRequest(
  config: ProviderRequestConfig,
  vars: Vars,
  fetchImpl: typeof fetch = fetch,
): Promise<ExecuteResult> {
  const started = Date.now();
  let request: BuiltRequest;
  try {
    request = buildRequest(config, vars);
  } catch (e) {
    return {
      ok: false, status: null, timeMs: 0,
      requestPreview: { url: config.base_url, method: config.http_method, headers: {} },
      responseBody: '', responseHeaders: {},
      error: `Invalid configuration: ${(e as Error).message}`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms ?? 15000);
  try {
    const res = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const text = await res.text();
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { respHeaders[k] = v; });
    return {
      ok: res.ok, status: res.status, timeMs: Date.now() - started,
      requestPreview: request, responseBody: text.slice(0, 4000), responseHeaders: respHeaders,
    };
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'Request timed out' : (e as Error).message;
    return {
      ok: false, status: null, timeMs: Date.now() - started,
      requestPreview: request, responseBody: '', responseHeaders: {}, error: msg,
    };
  } finally {
    clearTimeout(timeout);
  }
}
