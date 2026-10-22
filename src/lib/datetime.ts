// Bidi-safe date formatting.
//
// `toLocaleString()` under `dir="rtl"` scrambles the pieces visually:
// "10/22/2026, 8:31:11 AM" renders as "AM 8:31:11 ,10/22/2026". Numbers, the
// comma and the AM/PM token each get their own bidi run. An ISO-style string is
// neutral (digits + separators only), so it reads the same in both directions.
const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
