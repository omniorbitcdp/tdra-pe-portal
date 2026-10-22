'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, hasApiCache } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';
import { extractVariables, insertVariable, nextVariable, renderWithSamples } from '@/lib/templateVars';
import { isEditable, lockNote } from '@/lib/constants';

interface Tpl {
  id: string; template_code: string | null; template_name: string; category: string; channel: string;
  body: string; variables: string | null; variable_samples: Record<string, string> | null;
  status: string; header_id: string; remarks: string | null;
}
interface Hdr { id: string; header_code: string | null; header_name: string; sender_id: string; status: string }

const EMPTY = { header_id: '', template_name: '', category: 'TRANSACTIONAL', body: '', variable_samples: {} as Record<string, string> };

export default function TemplatesPage() {
  const [items, setItems] = useState<Tpl[]>([]);
  const [headers, setHeaders] = useState<Hdr[]>([]);
  const [allHeaders, setAllHeaders] = useState<Hdr[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [loaded, setLoaded] = useState(() => hasApiCache('/api/pe/templates'));
  const [error, setError] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({}); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState<string>('');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Variables are whatever the body declares, in <var1>, <var2> … order.
  const declared = useMemo(() => extractVariables(form.body), [form.body]);
  const preview = useMemo(() => renderWithSamples(form.body, form.variable_samples), [form.body, form.variable_samples]);

  async function load() {
    const [t, h] = await Promise.all([api<{ templates: Tpl[] }>('/api/pe/templates'), api<{ headers: Hdr[] }>('/api/pe/headers')]);
    if (t.ok) setItems((t.data as unknown as { templates: Tpl[] }).templates ?? []);
    if (h.ok) { const all = (h.data as unknown as { headers: Hdr[] }).headers ?? []; setAllHeaders(all); setHeaders(all.filter((x) => x.status === 'APPROVED')); }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  function addVariable() {
    const el = bodyRef.current;
    const caret = el?.selectionStart ?? form.body.length;
    const { body, caret: next } = insertVariable(form.body, caret, nextVariable(form.body));
    setForm((f) => ({ ...f, body }));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(next, next); });
  }

  function setSample(name: string, value: string) {
    setForm((f) => ({ ...f, variable_samples: { ...f.variable_samples, [name]: value } }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrors({}); setError(''); setNotice('');
    const res = await api('/api/pe/templates', { method: 'POST', body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? tr('Could not create')); return; }
    setForm({ ...EMPTY, variable_samples: {} }); setNotice(tr('Template draft created.')); await load();
  }
  async function submit(id: string) {
    if (busyId) return;            // one submission in flight at a time
    setBusyId(id); setError(''); setNotice('');
    const res = await api('/api/pe/submit', { method: 'POST', body: JSON.stringify({ module: 'TEMPLATE', id }) });
    setBusyId('');
    if (!res.ok) setError(res.data.error ?? tr('Submit failed')); else { setNotice(tr('Template submitted for approval.')); await load(); }
  }

  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title={tr("Template Registration")} subtitle={tr("Section 6 — SMS templates only, requires an approved header")} />
      <ErrorBox message={error} /><Notice message={notice} />
      <Card className="mb-6">
        {headers.length === 0
          ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr("You need at least one")} <strong>{tr("approved header")}</strong> {tr("before registering a template.")}</div>
          : (
            <form onSubmit={create} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div><label className="label">{tr("Approved header *")}</label><select className="input" value={form.header_id} onChange={(e) => setForm({ ...form, header_id: e.target.value })}><option value="">{tr("Select…")}</option>{headers.map((h) => <option key={h.id} value={h.id}>{h.header_name} ({h.sender_id})</option>)}</select>{errors.header_id && <p className="mt-1 text-xs text-rose-600">{errors.header_id}</p>}</div>
                <div><label className="label">{tr("Template name")}</label><input className="input" value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} />{errors.template_name && <p className="mt-1 text-xs text-rose-600">{errors.template_name}</p>}</div>
                <div><label className="label">{tr("Category")}</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="TRANSACTIONAL">{tr("Transactional")}</option><option value="OTP">{tr("OTP")}</option><option value="PROMOTIONAL">{tr("Promotional")}</option><option value="SERVICE">{tr("Service")}</option></select></div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="label mb-0">{tr("Template body")}</label>
                  <button type="button" className="btn-ghost btn-sm" onClick={addVariable}>{tr("+ Add variable")}</button>
                </div>
                <textarea ref={bodyRef} className="input min-h-[90px]" placeholder={tr("Dear <var1>, your order <var2> is ready for delivery.")} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                <p className="mt-1 text-xs text-slate-500">
                  Declare a placeholder with the <span className="font-mono">&lt;var1&gt;</span>, <span className="font-mono">&lt;var2&gt;</span> format — the numbering is assigned for you.
                </p>
                {errors.body && <p className="mt-1 text-xs text-rose-600">{errors.body}</p>}
              </div>

              {declared.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700">{tr("Sample content")}</span>
                    <span className="text-xs text-slate-500">{tr("Give each variable a value so the reviewer reads the message as a subscriber would.")}</span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {declared.map((v) => (
                      <div key={v}>
                        <label className="label"><span className="font-mono text-blue-700">&lt;{v}&gt;</span></label>
                        <input className="input" placeholder={`Sample value for ${v}`} value={form.variable_samples[v] ?? ''} onChange={(e) => setSample(v, e.target.value)} />
                        {errors[`variable_samples.${v}`] && <p className="mt-1 text-xs text-rose-600">{errors[`variable_samples.${v}`]}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {form.body.trim() && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">{tr("SMS preview")}</span>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{preview}</p>
                  <p className="mt-2 text-[11px] text-slate-500">{form.body.length} characters · {Math.max(1, Math.ceil(form.body.length / 160))} SMS part(s)</p>
                </div>
              )}

              <button className="btn-primary" disabled={busy}>{tr("Add template")}</button>
            </form>
          )}
      </Card>
      <Card className="overflow-x-auto">
        {items.length === 0 ? <Empty>{tr("No templates yet.")}</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">{tr("Template ID")}</th><th className="th">{tr("Name")}</th><th className="th">{tr("Header")}</th><th className="th">{tr("Category")}</th><th className="th">{tr("Variables")}</th><th className="th">{tr("Status")}</th><th className="th">{tr("Remarks")}</th><th className="th"></th></tr></thead>
            <tbody>
              {items.map((t) => (
                <>
                  <tr key={t.id}>
                    <td className="td font-mono text-xs">{t.template_code ?? '—'}</td>
                    <td className="td font-medium">{t.template_name}<span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{tr("SMS")}</span></td>
                    <td className="td text-xs">{allHeaders.find((x) => x.id === t.header_id)?.header_code ?? '—'}</td>
                    <td className="td">{t.category}</td>
                    <td className="td text-xs">{(t.variables ?? '').split(',').filter(Boolean).map((v) => <span key={v} className="mr-1 font-mono text-blue-700">&lt;{v}&gt;</span>)}{!(t.variables ?? '').trim() && <span className="text-slate-400">—</span>}</td>
                    <td className="td"><StatusPill status={t.status} /></td>
                    <td className="td">{t.remarks ?? '—'}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        {isEditable(t.status) && <button className="btn-ghost btn-sm" onClick={() => setEditing(editing === t.id ? '' : t.id)}>{editing === t.id ? 'Close' : 'Edit'}</button>}
                        {(t.status === 'DRAFT' || t.status === 'CLARIFICATION_REQUIRED' || t.status === 'REJECTED') && (
                          <button className="btn-ghost btn-sm" disabled={busyId === t.id} onClick={() => submit(t.id)}>
                            {busyId === t.id ? tr('Sending…') : t.status === 'DRAFT' ? tr('Submit') : tr('Resubmit')}
                          </button>
                        )}
                        {!isEditable(t.status) && <span className="text-xs text-slate-400">{tr(lockNote(t.status))}</span>}
                      </div>
                    </td>
                  </tr>
                  {editing === t.id && (
                    <tr key={`${t.id}-samples`}>
                      <td className="td bg-slate-50" colSpan={8}><TemplateEditor tpl={t} onSaved={async () => { setEditing(''); setNotice(tr('Template updated.')); await load(); }} /></td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/** Full inline editor for a template the enterprise may still correct:
 *  name, category, body, and the sample content of every declared variable. */
function TemplateEditor({ tpl, onSaved }: { tpl: Tpl; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(tpl.template_name);
  const [category, setCategory] = useState(tpl.category);
  const [body, setBody] = useState(tpl.body);
  const [samples, setSamples] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const v of extractVariables(tpl.body)) out[v] = tpl.variable_samples?.[v] ?? '';
    return out;
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const declared = useMemo(() => extractVariables(body), [body]);
  const preview = useMemo(() => renderWithSamples(body, samples), [body, samples]);

  function addVariable() {
    const el = bodyRef.current;
    const caret = el?.selectionStart ?? body.length;
    const r = insertVariable(body, caret, nextVariable(body));
    setBody(r.body);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.caret, r.caret); });
  }

  async function save() {
    if (busy) return; setBusy(true); setErr(''); setErrors({});
    const res = await api('/api/pe/templates', {
      method: 'PUT',
      body: JSON.stringify({ id: tpl.id, template_name: name, category, body, variable_samples: samples }),
    });
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setErr(res.data.error ?? (Object.values(res.data.errors ?? {})[0] as string) ?? tr('Could not save')); return; }
    await onSaved();
  }

  return (
    <div className="space-y-3 py-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("Edit template ·")} <span className="font-mono">{tpl.template_code ?? tpl.template_name}</span></div>
      {tpl.status === 'CLARIFICATION_REQUIRED' && tpl.remarks && (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">Reviewer remarks: {tpl.remarks}</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label">{tr("Template name")}</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} />{errors.template_name && <p className="mt-1 text-xs text-rose-600">{errors.template_name}</p>}</div>
        <div><label className="label">{tr("Category")}</label><select className="input" value={category} onChange={(e) => setCategory(e.target.value)}><option value="TRANSACTIONAL">{tr("Transactional")}</option><option value="OTP">{tr("OTP")}</option><option value="PROMOTIONAL">{tr("Promotional")}</option><option value="SERVICE">{tr("Service")}</option></select></div>
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="label mb-0">{tr("Template body")}</label>
          <button type="button" className="btn-ghost btn-sm" onClick={addVariable}>{tr("+ Add variable")}</button>
        </div>
        <textarea ref={bodyRef} className="input min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">{tr("Declare placeholders as")} <span className="font-mono">&lt;var1&gt;</span>, <span className="font-mono">&lt;var2&gt;</span> …</p>
        {errors.body && <p className="mt-1 text-xs text-rose-600">{errors.body}</p>}
      </div>
      {declared.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <span className="text-sm font-semibold text-slate-700">{tr("Sample content")}</span>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {declared.map((v) => (
              <div key={v}>
                <label className="label"><span className="font-mono text-blue-700">&lt;{v}&gt;</span></label>
                <input className="input" placeholder={`Sample value for ${v}`} value={samples[v] ?? ''} onChange={(e) => setSamples({ ...samples, [v]: e.target.value })} />
                {errors[`variable_samples.${v}`] && <p className="mt-1 text-xs text-rose-600">{errors[`variable_samples.${v}`]}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {body.trim() && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{tr("SMS preview")}</span>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{preview}</p>
        </div>
      )}
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <button className="btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? tr('Saving…') : tr('Save changes')}</button>
    </div>
  );
}
