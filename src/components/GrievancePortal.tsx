'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api, apiForm } from '@/lib/client';
import { StatusPill } from '@/components/ui';
import { GRIEVANCE_CATEGORIES, GRIEVANCE_CATEGORY_LABELS, GRIEVANCE_STATUS_LABELS, type GrievanceCategory } from '@/lib/grievance';

type Tab = 'raise' | 'track';

interface TrackResult {
  grievance_code: string; status: string; category: string; reported_header: string;
  message_content: string; highlighted_url: string | null; highlighted_phone: string | null;
  created_at: string; sla_due_at: string; acknowledged_at: string | null; resolved_at: string | null;
  resolution_remarks: string | null; enterprise: string | null; matched: boolean;
  overdue: boolean; hours_remaining: number | null; reporter: string;
  attachment_url: string | null; attachment_name: string | null;
  escalated_at: string | null; escalation_reason: string | null;
  returned_at: string | null; return_reason: string | null;
  reopened_at: string | null; reopen_reason: string | null; reopen_count: number;
  closed_at: string | null;
  can_reopen: boolean; can_escalate: boolean;
  timeline: Array<{ at: string | null; label: string; done: boolean }>;
}

const EMPTY = {
  reported_header: '', message_content: '', category: 'FRAUD' as GrievanceCategory,
  highlighted_url: '', highlighted_phone: '', description: '',
  subscriber_name: '', subscriber_email: '', subscriber_mobile: '',
};

export function GrievancePortal({ initialTab, slaHours, maxFileMb }: { initialTab: Tab; slaHours: number; maxFileMb: number }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
          Subscriber grievance redressal
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{tr("Report an SMS you did not expect")}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          If you received fraudulent, spam or unsolicited commercial SMS, tell us which header it came from.
          The grievance goes straight to the business that owns that sender ID{` `}
          and is monitored by the platform administrator. Resolution target: <strong>{slaHours} hours</strong>.
        </p>
      </div>

      <div className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
        {([['raise', 'Raise Grievance'], ['track', 'Track Grievance']] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'raise' ? <RaiseForm maxFileMb={maxFileMb} onTrack={() => setTab('track')} /> : <TrackForm />}
      </div>
    </div>
  );
}

function RaiseForm({ maxFileMb, onTrack }: { maxFileMb: number; onTrack: () => void }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [file, setFile] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ sender_id: string; header_name: string }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; matched: boolean; enterprise: string | null; sla: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const q = form.reported_header.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const r = await api<{ headers: Array<{ sender_id: string; header_name: string }> }>(`/api/grievances/headers?q=${encodeURIComponent(q)}`);
      if (r.ok) setSuggestions((r.data as unknown as { headers: [] }).headers ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [form.reported_header]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({}); setError('');
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, v);
    if (file) fd.set('attachment', file);

    const res = await apiForm<{ grievance: { grievance_code: string; sla_due_at: string }; matched: boolean; enterprise: string | null }>('/api/grievances', fd);
    setBusy(false);
    if (!res.ok) { setErrors(res.data.errors ?? {}); setError(res.data.error ?? tr('Could not submit the grievance')); return; }
    const d = res.data as unknown as { grievance: { grievance_code: string; sla_due_at: string }; matched: boolean; enterprise: string | null };
    setDone({ code: d.grievance.grievance_code, matched: d.matched, enterprise: d.enterprise, sla: d.grievance.sla_due_at });
  }

  if (done) {
    return (
      <div className="card p-7 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">{tr("Grievance registered")}</h2>
        <p className="mt-1 text-sm text-slate-500">{tr("Keep this reference — you need it to track progress.")}</p>
        <div className="mx-auto mt-5 flex max-w-sm items-center justify-between gap-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/60 px-5 py-4">
          <span className="font-mono text-xl font-bold tracking-wider text-blue-800">{done.code}</span>
          <button type="button" className="btn-ghost btn-sm"
            onClick={() => { navigator.clipboard?.writeText(done.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          {done.matched
            ? <>{tr("Routed to")} <strong>{done.enterprise}</strong> {tr("— the owner of that header.")}</>
            : <>{tr("No registered header matched, so this has gone to the platform administrator for review.")}</>}
        </p>
        <p className="mt-1 text-xs text-slate-500">Target response by {new Date(done.sla).toLocaleString()}.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="btn-primary" onClick={onTrack}>{tr("Track this grievance")}</button>
          <a className="btn-ghost" href="/grievance">{tr("Raise another")}</a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tr("What did you receive?")}</h2>
        <p className="mt-1 text-xs text-slate-500">{tr("All fields marked * are required. Your number is only used to look the grievance up.")}</p>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label">{tr("Header / sender ID the message came from *")}</label>
          <input className="input" placeholder={tr("e.g. ALPHA or Onextel official header")} list="grievance-headers"
            value={form.reported_header} onChange={(e) => set('reported_header', e.target.value)} required />
          <datalist id="grievance-headers">
            {suggestions.map((s) => <option key={s.sender_id} value={s.sender_id}>{s.header_name}</option>)}
          </datalist>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button type="button" key={s.sender_id} onClick={() => set('reported_header', s.sender_id)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">
                  {s.sender_id} · {s.header_name}
                </button>
              ))}
            </div>
          )}
          {errors.reported_header && <p className="mt-1 text-xs text-rose-600">{errors.reported_header}</p>}
        </div>

        <div className="md:col-span-2">
          <label className="label">{tr("Message content you received *")}</label>
          <textarea className="input min-h-[100px]" placeholder={tr("Paste the SMS exactly as it arrived…")}
            value={form.message_content} onChange={(e) => set('message_content', e.target.value)} required />
          {errors.message_content && <p className="mt-1 text-xs text-rose-600">{errors.message_content}</p>}
        </div>

        <div>
          <label className="label">{tr("Type of grievance")}</label>
          <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
            {GRIEVANCE_CATEGORIES.map((c) => <option key={c} value={c}>{tr(GRIEVANCE_CATEGORY_LABELS[c])}</option>)}
          </select>
        </div>

        <div>
          <label className="label">{tr("Suspicious URL in the message")}</label>
          <input className="input" placeholder={tr("https://suspicious-link.example")} value={form.highlighted_url}
            onChange={(e) => set('highlighted_url', e.target.value)} />
          {errors.highlighted_url && <p className="mt-1 text-xs text-rose-600">{errors.highlighted_url}</p>}
        </div>

        <div>
          <label className="label">{tr("Phone number it came from / asked you to call")}</label>
          <input className="input" placeholder="+9715xxxxxxxx" value={form.highlighted_phone}
            onChange={(e) => set('highlighted_phone', e.target.value)} />
        </div>

        <div>
          <label className="label">{tr("Screenshot of the message")}</label>
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="input file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="mt-1 text-[11px] text-slate-500">JPG, PNG, WEBP or PDF · up to {maxFileMb} MB</p>
          {errors.attachment && <p className="mt-1 text-xs text-rose-600">{errors.attachment}</p>}
        </div>

        <div className="md:col-span-2">
          <label className="label">{tr("Anything else we should know")}</label>
          <textarea className="input min-h-[70px]" placeholder={tr("Optional — what happened, how often, any loss…")}
            value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{tr("Your contact details")}</div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div><label className="label">{tr("Name")}</label><input className="input" value={form.subscriber_name} onChange={(e) => set('subscriber_name', e.target.value)} /></div>
          <div><label className="label">{tr("Mobile number *")}</label><input className="input" placeholder="+9715xxxxxxxx" value={form.subscriber_mobile} onChange={(e) => set('subscriber_mobile', e.target.value)} required />{errors.subscriber_mobile && <p className="mt-1 text-xs text-rose-600">{errors.subscriber_mobile}</p>}</div>
          <div><label className="label">{tr("E-mail")}</label><input type="email" className="input" value={form.subscriber_email} onChange={(e) => set('subscriber_email', e.target.value)} />{errors.subscriber_email && <p className="mt-1 text-xs text-rose-600">{errors.subscriber_email}</p>}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">{tr("Submitting creates a unique grievance ID you can track.")}</p>
        <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit grievance'}</button>
      </div>
    </form>
  );
}

function TrackForm() {
  const [id, setId] = useState(''); const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [r, setR] = useState<TrackResult | null>(null);

  async function fetchStatus(silent = false) {
    if (!id.trim() || !contact.trim()) return;
    if (!silent) { setBusy(true); setError(''); setR(null); }
    const res = await api<{ grievance: TrackResult }>(
      `/api/grievances/track?grievanceId=${encodeURIComponent(id.trim())}&contact=${encodeURIComponent(contact.trim())}&_=${Date.now()}`,
    );
    if (!silent) setBusy(false);
    if (!res.ok) { if (!silent) setError(res.data.error ?? tr('Lookup failed')); return; }
    setR((res.data as unknown as { grievance: TrackResult }).grievance);
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    await fetchStatus();
  }

  // Coming back to the tab refreshes the status, so a decision taken by the
  // enterprise shows up without re-submitting the form.
  useEffect(() => {
    if (!r) return;
    const onFocus = () => { void fetchStatus(true); };
    window.addEventListener('focus', onFocus);
    const timer = setInterval(onFocus, 60000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.grievance_code, id, contact]);

  return (
    <div className="space-y-5">
      <form onSubmit={lookup} className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{tr("Track your grievance")}</h2>
          <p className="mt-1 text-xs text-slate-500">{tr("Enter the grievance ID you were given and the mobile number or e-mail you filed with.")}</p>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label">{tr("Grievance ID")}</label><input className="input font-mono" placeholder={tr("GRV-12345678")} value={id} onChange={(e) => setId(e.target.value)} required /></div>
          <div><label className="label">{tr("Mobile or e-mail used")}</label><input className="input" placeholder="+9715xxxxxxxx" value={contact} onChange={(e) => setContact(e.target.value)} required /></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy}>{busy ? 'Looking up…' : 'Check status'}</button>
          {r && <button type="button" className="btn-ghost btn-sm" onClick={() => void fetchStatus()}>{tr("Refresh")}</button>}
        </div>
      </form>

      {r && <TrackResultCard r={r} contact={contact} onChanged={() => fetchStatus(true)} />}
    </div>
  );
}

function TrackResultCard({ r, contact, onChanged }: { r: TrackResult; contact: string; onChanged: () => Promise<void> }) {
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-lg font-bold tracking-wide text-slate-900">{r.grievance_code}</div>
          <div className="mt-1 text-xs text-slate-500">
            Filed {new Date(r.created_at).toLocaleString()}
            {r.enterprise ? <> {tr("· routed to")} <strong>{r.enterprise}</strong></> : ' · with the platform administrator'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={r.status} label={tr(GRIEVANCE_STATUS_LABELS[r.status as keyof typeof GRIEVANCE_STATUS_LABELS] ?? r.status)} />
          {r.overdue && <span className="pill bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">{tr("SLA lapsed")}</span>}
        </div>
      </div>

      <ol className="mt-6 space-y-4">
        {r.timeline.map((t) => (
          <li key={t.label} className="flex gap-3">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              t.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{t.done ? '✓' : '·'}</span>
            <span>
              <span className={`block text-sm font-semibold ${t.done ? 'text-slate-800' : 'text-slate-400'}`}>{t.label}</span>
              {t.at && <span className="block text-[11px] text-slate-500">{new Date(t.at).toLocaleString()}</span>}
            </span>
          </li>
        ))}
      </ol>

      {r.escalation_reason && (
        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">{tr("Escalated to the platform administrator")}</div>
          <p className="mt-1 text-sm text-slate-800">{r.escalation_reason}</p>
          {r.escalated_at && <p className="mt-1 text-[11px] text-slate-500">{new Date(r.escalated_at).toLocaleString()}</p>}
        </div>
      )}

      {r.return_reason && (
        <div className="mt-5 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800">{tr("Returned to the enterprise for justification")}</div>
          <p className="mt-1 text-sm text-slate-800">{r.return_reason}</p>
          {r.returned_at && <p className="mt-1 text-[11px] text-slate-500">{new Date(r.returned_at).toLocaleString()}</p>}
        </div>
      )}

      {r.resolution_remarks && (
        <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{tr("Response from the enterprise")}</div>
          <p className="mt-1 text-sm text-slate-800">{r.resolution_remarks}</p>
        </div>
      )}

      {(r.reopen_count > 0 || r.reopened_at) && (
        <p className="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Re-opened {r.reopen_count === 1 ? 'once' : `${r.reopen_count} times`}
          {r.reopened_at ? ` — latest on ${new Date(r.reopened_at).toLocaleString()}` : ''}.
          {r.reopen_reason ? ` Reason given: ${r.reopen_reason}` : ''}
        </p>
      )}

      <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr("Header reported")}</dt><dd className="text-sm font-medium text-slate-800">{r.reported_header}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr("Target resolution")}</dt><dd className="text-sm text-slate-800">{new Date(r.sla_due_at).toLocaleString()}</dd></div>
        {r.highlighted_url && <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr("Suspicious URL")}</dt><dd className="break-all text-sm text-slate-800">{r.highlighted_url}</dd></div>}
        {r.highlighted_phone && <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr("Phone highlighted")}</dt><dd className="text-sm text-slate-800">{r.highlighted_phone}</dd></div>}
        <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr("Message you reported")}</dt><dd className="whitespace-pre-wrap text-sm text-slate-700">{r.message_content}</dd></div>
        {r.attachment_url && (
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tr("Your screenshot")}</dt>
            <dd className="text-sm"><a className="font-semibold text-blue-700 hover:underline" href={r.attachment_url} target="_blank" rel="noreferrer">{r.attachment_name ?? 'Open attachment'}</a></dd>
          </div>
        )}
      </dl>
      {(r.can_reopen || r.can_escalate) && <ReporterActions r={r} contact={contact} onChanged={onChanged} />}

      <p className="mt-4 text-[11px] text-slate-400">Reported by {r.reporter} · contact supplied: {contact.slice(0, 3)}•••</p>
    </div>
  );
}

/** Re-open or escalate a concluded grievance — the reporter's own remedy. */
function ReporterActions({ r, contact, onChanged }: { r: TrackResult; contact: string; onChanged: () => Promise<void> }) {
  const [choice, setChoice] = useState<'' | 'REOPEN' | 'ESCALATE'>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(action: 'REOPEN' | 'ESCALATE') {
    if (busy) return;
    if (reason.trim().length < 5) { setError('Tell us briefly why (at least 5 characters).'); return; }
    setBusy(true); setError('');
    const res = await api('/api/grievances/reopen', {
      method: 'POST',
      body: JSON.stringify({ grievanceId: r.grievance_code, contact, action, reason: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) { setError((res.data as { error?: string }).error ?? tr('Could not update the grievance.')); return; }
    setDone(action === 'REOPEN'
      ? 'Re-opened. The enterprise has been notified and must respond again.'
      : 'Escalated. The platform administrator now has your grievance.');
    setChoice(''); setReason('');
    await onChanged();
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{tr("Not satisfied with the outcome?")}</div>
      <p className="mt-1 text-xs text-slate-600">
        You can send this back to the enterprise for another look, or escalate it to the platform administrator.
      </p>

      {done && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{done}</div>}
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      {choice === '' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.can_reopen && <button className="btn-ghost btn-sm" onClick={() => { setChoice('REOPEN'); setDone(''); }}>{tr("Re-open grievance")}</button>}
          {r.can_escalate && <button className="btn-primary btn-sm" onClick={() => { setChoice('ESCALATE'); setDone(''); }}>{tr("Escalate to the platform administrator")}</button>}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="label">{choice === 'REOPEN' ? 'Why should this be re-opened?' : 'Why are you escalating?'}</label>
          <textarea className="input min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={choice === 'REOPEN' ? 'The problem is still happening / the response did not address it…' : 'Explain why the enterprise response is unsatisfactory…'} />
          <div className="flex flex-wrap items-center gap-2">
            <button className={choice === 'REOPEN' ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'} disabled={busy}
              onClick={() => void submit(choice)}>
              {busy ? 'Sending…' : choice === 'REOPEN' ? 'Confirm re-open' : 'Confirm escalation'}
            </button>
            <button className="btn-ghost btn-sm" disabled={busy} onClick={() => { setChoice(''); setError(''); }}>{tr("Cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
