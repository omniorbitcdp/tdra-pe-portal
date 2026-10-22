import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@/lib/settings';
import { getLang } from '@/lib/i18n/server';
import { dirFor } from '@/lib/i18n';
import { LangProvider } from '@/components/LangProvider';

export const metadata: Metadata = {
  title: 'Onextel Portal',
  description: 'Business registration and DLT communication portal',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, lang] = await Promise.all([getSettings(), getLang()]);
  const dir = dirFor(lang);
  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        <style>{`:root{--brand:${settings.brandColor};}`}</style>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
