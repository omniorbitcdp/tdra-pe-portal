'use client';
import { useSearchParams } from 'next/navigation';

/** Shown when a user is bounced out of a page their role cannot open. */
export function DeniedBanner() {
  const params = useSearchParams();
  if (params.get('denied') !== '1') return null;
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>Not available for your role.</strong> You were returned to your own workbench — you can only open the
      queue assigned to you.
    </div>
  );
}
