'use client';
import { t as tr } from '@/lib/i18n/live';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn-ghost" disabled={busy} onClick={async () => {
      setBusy(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    }}>{busy ? tr('Signing out…') : tr('Sign out')}</button>
  );
}
