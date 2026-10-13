import Link from 'next/link';
import { SetPasswordForm } from '@/components/SetPasswordForm';

export default function ActivatePage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900">Activate your account</h1>
        <p className="mt-1 text-sm text-slate-500">Set a password to activate your PE portal account.</p>
        {searchParams.token
          ? <SetPasswordForm token={searchParams.token} action="activate" />
          : <p className="mt-4 text-sm text-rose-600">Missing activation token. Use the link from your email.</p>}
        <p className="mt-4 text-xs text-slate-500"><Link className="brand-text font-semibold" href="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}
