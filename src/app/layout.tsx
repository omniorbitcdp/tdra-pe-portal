import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = { title: 'TDRA PE Portal', description: 'Principal Entity DLT registration portal' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <html lang="en">
      <head>
        <style>{`:root{--brand:${settings.brandColor};}`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
