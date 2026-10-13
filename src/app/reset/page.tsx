import Link from 'next/link';
import { SetPasswordForm } from '@/components/SetPasswordForm';

export default function ResetPage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900">Reset password</h1>
        {searchParams.token
          ? <SetPasswordForm token={searchParams.token} action="reset" />
          : <p className="mt-4 text-sm text-rose-600">Missing reset token. Use the link from your email.</p>}
        <p className="mt-4 text-xs text-slate-500"><Link className="brand-text font-semibold" href="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}
