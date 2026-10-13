import Link from 'next/link';
import { RegisterForm } from '@/components/RegisterForm';

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-10">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900">Create a Principal Entity account</h1>
        <p className="mt-1 text-sm text-slate-500">Step 1 of the TDRA registration flow. You will complete entity details and KYC next.</p>
        <RegisterForm />
        <p className="mt-4 text-xs text-slate-500">Already registered? <Link className="brand-text font-semibold" href="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
