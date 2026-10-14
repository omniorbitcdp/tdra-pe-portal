'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { CHANNELS } from '@/lib/constants';

interface Provider {
  id?: string; channel: string; provider_name: string; base_url: string; http_method: string;
  headers: Record<string, string>; query_params: Record<string, string>; body_template: string | null;
  auth_type: string; auth_config: Record<string, string>; timeout_ms: number; is_active: boolean; is_default: boolean;
}

const BLANK: Provider = {
  channel: 'SMS', provider_name: '', base_url: '', http_method: 'POST', headers: { 'Content-Type': 'application/json' },
  query_params: {}, body_template: '{\n  "to": "{{recipient}}",\n  "message": "{{body}}"\n}', auth_type: 'BEARER',
  auth_config: { token: '' }, timeout_ms: 15000, is_active: true, is_default: true,
};

const SECRET_KEYS = ['token', 'password', 'key_value'];
const SECRET_MASK = '__SET__';
/** Stored secrets come back masked; show a blank field instead of the mask. */
function displayAuth(a: Record<string, string> | undefined): Record<string, string> {
  const o = { ...(a ?? {}) };
  for (const k of SECRET_KEYS) if (o[k] === SECRET_MASK) o[k] = '';
  return o;
}
/** Blank secret on an existing provider means "keep the stored value". */
function prepareAuthForSave(p: Provider): Record<string, string> {
  const o = { ...(p.auth_config ?? {}) };
  const wasSet = (k: string) => Boolean(p.id) && !o[k];
  for (const k of SECRET_KEYS) if (wasSet(k)) o[k] = SECRET_MASK;
  return o;
}

const SAMPLE_VARS = { recipient: '+971500000000', body: 'Test message from TDRA portal', subject: 'Test subject', sender_id: 'TDRA', link: 'https://example.com', name: 'Test User', otp: '123456' };

export default function ApiConfigPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [draft, setDraft] = useState<Provider>(BLANK);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [varsText, setVarsText] = useState(JSON.stringify(SAMPLE_VARS, null, 2));
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [testing, setTesting] = useState(false);

  async function load() { const r = await api<{ providers: Provider[] }>('/api/admin/providers'); if (r.ok) setProviders((r.data as unknown as { providers: Provider[] }).providers ?? []); else setError(r.data.error); setLoaded(true); }
  useEffect(() => { load(); }, []);

  function edit(p: Provider) { setDraft({ ...p, headers: p.headers ?? {}, query_params: p.query_params ?? {}, auth_config: displayAuth(p.auth_config) }); setResult(null); }

  async function save() {
    setError(''); setNotice('');
    const payload = { ...draft, query_params: draft.query_params ?? {}, auth_config: prepareAuthForSave(draft) };
    const res = draft.id ? await api(`/api/admin/providers/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
                         : await api('/api/admin/providers', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { setError(res.data.error ?? 'Save failed'); return; }
    setNotice('Provider saved.'); await load();
  }
  async function remove(id: string) {
    const res = await api(`/api/admin/providers/${id}`, { method: 'DELETE' });
    if (!res.ok) setError(res.data.error ?? 'Delete failed'); else { setNotice('Provider deleted.'); await load(); }
  }

  function safeVars(): Record<string, string> {
    try { return JSON.parse(varsText); } catch { setError('Test variables must be valid JSON.'); return SAMPLE_VARS; }
  }

  async function sendTest(useSaved: boolean) {
    setError(''); setNotice(''); setTesting(true); setResult(null);
    const vars = safeVars();
    const body = useSaved && draft.id ? { providerId: draft.id, vars } : { provider: draft, vars };
    const res = await api<{ result: Record<string, unknown> }>('/api/admin/providers/test', { method: 'POST', body: JSON.stringify(body) });
    setTesting(false);
    if (!res.ok) { setError(res.data.error ?? 'Test failed to run'); return; }
    setResult((res.data as unknown as { result: Record<string, unknown> }).result);
  }

  if (!loaded) return <Loader />;
  const r = result as { ok?: boolean; status?: number | null; timeMs?: number; error?: string; responseBody?: string; responseHeaders?: Record<string, string>; requestPreview?: { url: string; method: string; headers: Record<string, string>; body?: string } } | null;

  return (
    <div>
      <PageHeader title="Email / SMS / WhatsApp API Configuration"
        subtitle="Configure your own provider APIs and test them — like Postman. Credentials are stored server-side."
        actions={<button className="btn-primary" onClick={() => { setDraft(BLANK); setResult(null); }}>+ New provider</button>} />
      <ErrorBox message={error} /><Notice message={notice} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: provider list */}
        <Card className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Configured providers</h2>
          {providers.length === 0 ? <Empty>No providers configured.</Empty> : (
            <ul className="space-y-2">
              {providers.map((p) => (
                <li key={p.id} className={`rounded-lg border p-3 ${draft.id === p.id ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{p.provider_name}</div>
                      <div className="text-xs text-slate-400">{p.channel} · {p.http_method}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {p.is_default && <span className="pill bg-indigo-100 text-indigo-700">default</span>}
                      {!p.is_active && <span className="pill bg-slate-100 text-slate-500">inactive</span>}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs">
                    <button className="brand-text font-semibold" onClick={() => edit(p)}>Edit</button>
                    <button className="text-rose-600" onClick={() => remove(p.id!)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Middle: editor */}
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{draft.id ? 'Edit provider' : 'New provider'}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div><label className="label">Channel</label><select className="input" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Provider name</label><input className="input" value={draft.provider_name} onChange={(e) => setDraft({ ...draft, provider_name: e.target.value })} /></div>
            <div className="md:col-span-2"><label className="label">Endpoint URL (supports {`{{vars}}`})</label><input className="input" value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} placeholder="https://api.provider.com/v1/messages" /></div>
            <div><label className="label">Method</label><select className="input" value={draft.http_method} onChange={(e) => setDraft({ ...draft, http_method: e.target.value })}>{['GET', 'POST', 'PUT', 'PATCH'].map((m) => <option key={m}>{m}</option>)}</select></div>
            <div><label className="label">Timeout (ms)</label><input type="number" className="input" value={draft.timeout_ms} onChange={(e) => setDraft({ ...draft, timeout_ms: Number(e.target.value) })} /></div>
            <div><label className="label">Auth type</label><select className="input" value={draft.auth_type} onChange={(e) => setDraft({ ...draft, auth_type: e.target.value })}>{['NONE', 'BEARER', 'BASIC', 'API_KEY'].map((a) => <option key={a}>{a}</option>)}</select></div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Active</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} /> Default for channel</label>
            </div>
          </div>

          {draft.auth_type !== 'NONE' && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {draft.auth_type === 'BEARER' && <div className="md:col-span-2"><label className="label">Bearer token</label><input className="input" placeholder="•••••• saved — leave blank to keep" value={draft.auth_config.token ?? ''} onChange={(e) => setDraft({ ...draft, auth_config: { ...draft.auth_config, token: e.target.value } })} /></div>}
              {draft.auth_type === 'BASIC' && <>
                <div><label className="label">Username</label><input className="input" value={draft.auth_config.username ?? ''} onChange={(e) => setDraft({ ...draft, auth_config: { ...draft.auth_config, username: e.target.value } })} /></div>
                <div><label className="label">Password</label><input className="input" type="password" value={draft.auth_config.password ?? ''} onChange={(e) => setDraft({ ...draft, auth_config: { ...draft.auth_config, password: e.target.value } })} /></div>
              </>}
              {draft.auth_type === 'API_KEY' && <>
                <div><label className="label">Key name</label><input className="input" value={draft.auth_config.key_name ?? ''} onChange={(e) => setDraft({ ...draft, auth_config: { ...draft.auth_config, key_name: e.target.value } })} placeholder="X-Api-Key" /></div>
                <div><label className="label">Key value</label><input className="input" placeholder="•••••• saved — leave blank to keep" value={draft.auth_config.key_value ?? ''} onChange={(e) => setDraft({ ...draft, auth_config: { ...draft.auth_config, key_value: e.target.value } })} /></div>
                <div><label className="label">Send key in</label><select className="input" value={draft.auth_config.key_in ?? 'header'} onChange={(e) => setDraft({ ...draft, auth_config: { ...draft.auth_config, key_in: e.target.value } })}><option value="header">Header</option><option value="query">Query param</option></select></div>
              </>}
            </div>
          )}

          <div className="mt-3"><label className="label">Headers (JSON)</label><textarea className="input min-h-[70px] font-mono text-xs" value={JSON.stringify(draft.headers ?? {}, null, 2)} onChange={(e) => { try { setDraft({ ...draft, headers: JSON.parse(e.target.value || '{}') }); } catch { /* keep typing */ } }} /></div>
          <div className="mt-3"><label className="label">Query params (JSON)</label><textarea className="input min-h-[60px] font-mono text-xs" value={JSON.stringify(draft.query_params ?? {}, null, 2)} onChange={(e) => { try { setDraft({ ...draft, query_params: JSON.parse(e.target.value || '{}') }); } catch { /* keep typing */ } }} /></div>
          <div className="mt-3"><label className="label">Body template</label><textarea className="input min-h-[110px] font-mono text-xs" value={draft.body_template ?? ''} onChange={(e) => setDraft({ ...draft, body_template: e.target.value })} /></div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={save}>Save provider</button>
            <button className="btn-ghost" onClick={() => sendTest(false)} disabled={testing}>{testing ? 'Sending…' : 'Send test (unsaved config)'}</button>
            {draft.id && <button className="btn-ghost" onClick={() => sendTest(true)} disabled={testing}>Send test (saved)</button>}
          </div>
        </Card>
      </div>

      {/* Test console */}
      <Card className="mt-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Test console</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="label">Test variables (JSON) — substituted into the request</label>
            <textarea className="input min-h-[180px] font-mono text-xs" value={varsText} onChange={(e) => setVarsText(e.target.value)} />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Response</span>
              {r && <span className={`pill ${r.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{r.ok ? 'OK' : 'FAILED'} {r.status ? `· HTTP ${r.status}` : ''} · {r.timeMs}ms</span>}
            </div>
            {r?.requestPreview && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <div className="font-mono">{r.requestPreview.method} {r.requestPreview.url}</div>
                <pre className="mt-2 max-h-[90px] overflow-auto whitespace-pre-wrap">{JSON.stringify(r.requestPreview.headers, null, 2)}</pre>
                {r.requestPreview.body && <pre className="mt-2 max-h-[90px] overflow-auto whitespace-pre-wrap">{r.requestPreview.body}</pre>}
              </div>
            )}
            {r?.error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{r.error}</div>}
            {r?.responseBody !== undefined && <pre className="mt-2 max-h-[220px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap">{r.responseBody || '(empty response)'}</pre>}
            {!r && <p className="text-sm text-slate-400">Run a test to see the request and response here.</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
