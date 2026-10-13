import Link from 'next/link';
import { ForgotForm } from '@/components/ForgotForm';

export default function ForgotPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-500">We will email you a secure, time-limited reset link.</p>
        <ForgotForm />
        <p className="mt-4 text-xs text-slate-500"><Link className="brand-text font-semibold" href="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}
