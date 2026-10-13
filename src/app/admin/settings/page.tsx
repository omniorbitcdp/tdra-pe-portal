'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card } from '@/components/ui';
import { Loader, ErrorBox, Notice } from '@/components/nav';

interface Settings { operatorName: string; operatorShortName: string; logoDataUrl: string | null; brandColor: string; maxKycFileMb: number }

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ settings: Settings }>('/api/admin/settings').then((r) => { if (!r.ok) setError(r.data.error); else setSettings((r.data as unknown as { settings: Settings }).settings); }); }, []);
  function set<K extends keyof Settings>(k: K, v: Settings[K]) { setSettings((s) => (s ? { ...s, [k]: v } : s)); }

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 1_500_000) { setError('Logo must be under ~1.5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => set('logoDataUrl', String(reader.result));
    reader.readAsDataURL(f);
  }

  async function save() {
    if (!settings) return;
    setBusy(true); setError(''); setNotice('');
    const res = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
      operator_name: settings.operatorName, operator_short_name: settings.operatorShortName,
      logo_data_url: settings.logoDataUrl, brand_color: settings.brandColor, max_kyc_file_mb: settings.maxKycFileMb,
    }) });
    setBusy(false);
    if (!res.ok) { setError(res.data.error ?? 'Could not save'); return; }
    setNotice('Settings saved. Reload the page to see the new branding.');
  }

  if (error && !settings) return <ErrorBox message={error} />;
  if (!settings) return <Loader />;

  return (
    <div>
      <PageHeader title="Branding & Platform Settings" subtitle="Change the telecom operator name and logo at any time" />
      <ErrorBox message={error} /><Notice message={notice} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Operator identity</h2>
          <div className="space-y-4">
            <div><label className="label">Telecom operator name</label><input className="input" value={settings.operatorName} onChange={(e) => set('operatorName', e.target.value)} /></div>
            <div><label className="label">Short name (logo fallback / initials)</label><input className="input" value={settings.operatorShortName} onChange={(e) => set('operatorShortName', e.target.value)} /></div>
            <div><label className="label">Brand colour</label>
              <div className="flex items-center gap-3">
                <input type="color" value={settings.brandColor} onChange={(e) => set('brandColor', e.target.value)} className="h-10 w-16 rounded border border-slate-300" />
                <input className="input max-w-[140px]" value={settings.brandColor} onChange={(e) => set('brandColor', e.target.value)} />
              </div>
            </div>
            <div><label className="label">Maximum KYC file size (MB)</label><input type="number" className="input max-w-[140px]" value={settings.maxKycFileMb} onChange={(e) => set('maxKycFileMb', Number(e.target.value))} /></div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Logo</h2>
          <p className="mb-3 text-xs text-slate-500">Upload an image (stored as a base64 data URL) or paste an image URL.</p>
          <div className="mb-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
            {settings.logoDataUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={settings.logoDataUrl} alt="logo preview" className="max-h-20 max-w-full" />
              : <span className="text-xs text-slate-400">No logo configured — initials will be shown</span>}
          </div>
          <label className="btn-ghost cursor-pointer">Upload image<input type="file" accept="image/*" className="hidden" onChange={onLogo} /></label>
          <div className="mt-3"><label className="label">Logo URL / data URL</label><input className="input" value={settings.logoDataUrl ?? ''} onChange={(e) => set('logoDataUrl', e.target.value || null)} placeholder="https://… or data:image/png;base64,…" /></div>
          {settings.logoDataUrl && <button className="mt-3 text-xs text-rose-600" onClick={() => set('logoDataUrl', null)}>Remove logo</button>}
        </Card>
      </div>
      <button className="btn-primary mt-5" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button>
    </div>
  );
}
