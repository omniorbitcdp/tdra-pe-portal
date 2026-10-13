// Notification service (§3, §10). Provider-agnostic: reads the ACTIVE default
// API provider for the channel configured on /admin/api-config, renders it and
// logs the delivery result. Never sends plain-text passwords.
import { db } from './db';
import type { Channel } from './constants';
import { executeRequest, type ProviderRequestConfig, type Vars } from './apiRequest';
import type { ApiProvider } from './types';

export interface SendArgs {
  event: string;
  channel: Channel;
  recipient: string;
  vars: Vars;
}

export interface SendResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  providerMessageId?: string | null;
  httpStatus?: number | null;
  error?: string;
}

function toConfig(p: ApiProvider): ProviderRequestConfig {
  return {
    channel: p.channel,
    provider_name: p.provider_name,
    base_url: p.base_url,
    http_method: p.http_method,
    headers: p.headers ?? {},
    query_params: p.query_params ?? {},
    body_template: p.body_template,
    auth_type: p.auth_type,
    auth_config: p.auth_config ?? {},
    timeout_ms: p.timeout_ms,
  };
}

export async function sendNotification(args: SendArgs): Promise<SendResult> {
  const client = db();
  const { data: providers } = await client
    .from('api_providers')
    .select('*')
    .eq('channel', args.channel)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .limit(1);

  const provider = (providers?.[0] ?? null) as ApiProvider | null;
  if (!provider) {
    await client.from('notifications_log').insert({
      event: args.event, channel: args.channel, recipient: args.recipient,
      status: 'SKIPPED', error: `No active ${args.channel} provider configured`,
      payload: { vars: args.vars },
    });
    return { status: 'SKIPPED', error: `No active ${args.channel} provider configured` };
  }

  const result = await executeRequest(toConfig(provider), args.vars);
  let providerMessageId: string | null = null;
  try {
    const parsed = JSON.parse(result.responseBody || '{}');
    providerMessageId = parsed?.message_id ?? parsed?.id ?? parsed?.messages?.[0]?.id ?? null;
  } catch { /* non-JSON response */ }

  const status = result.ok ? 'SENT' : 'FAILED';
  await client.from('notifications_log').insert({
    event: args.event,
    channel: args.channel,
    recipient: args.recipient,
    provider_id: provider.id,
    provider_message_id: providerMessageId,
    status,
    http_status: result.status,
    error: result.error ?? null,
    payload: { vars: args.vars, request: result.requestPreview },
    response: { body: result.responseBody.slice(0, 2000) },
  });

  return { status, providerMessageId, httpStatus: result.status, error: result.error };
}
