'use client';
import { t as tr } from '@/lib/i18n/live';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { PageHeader, Card, StatusPill, Empty } from '@/components/ui';
import { Loader, ErrorBox } from '@/components/nav';

interface Row { id: number; event: string; channel: string; recipient: string; status: string; http_status: number | null; provider_message_id: string | null; error: string | null; created_at: string }

export default function NotificationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [channel, setChannel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  async function load() { const r = await api<{ notifications: Row[] }>(`/api/admin/notifications${channel ? `?channel=${channel}` : ''}`); if (r.ok) setRows((r.data as unknown as { notifications: Row[] }).notifications ?? []); else setError(r.data.error); setLoaded(true); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [channel]);
  if (!loaded) return <Loader />;
  return (
    <div>
      <PageHeader title={tr("Notification Log")} subtitle={tr("Event, channel, recipient, provider message id and delivery result")} />
      <ErrorBox message={error} />
      <div className="mb-4"><select className="input max-w-[200px]" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">{tr("All channels")}</option>{['EMAIL', 'SMS', 'WHATSAPP'].map((c) => <option key={tr(c)}>{tr(c)}</option>)}</select></div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <Empty>{tr("No notifications logged.")}</Empty> : (
          <table className="w-full">
            <thead><tr><th className="th">{tr("When")}</th><th className="th">{tr("Event")}</th><th className="th">{tr("Channel")}</th><th className="th">{tr("Recipient")}</th><th className="th">{tr("Status")}</th><th className="th">{tr("HTTP")}</th><th className="th">{tr("Message ID")}</th><th className="th">{tr("Error")}</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="td">{tr(r.event)}</td><td className="td">{tr(r.channel)}</td><td className="td">{r.recipient}</td>
                <td className="td"><StatusPill status={tr(r.status)} /></td><td className="td">{r.http_status ?? '—'}</td>
                <td className="td text-xs">{r.provider_message_id ?? '—'}</td><td className="td text-xs text-rose-600">{r.error ?? ''}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
