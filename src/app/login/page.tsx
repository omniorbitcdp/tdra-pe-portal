import { redirect } from 'next/navigation';
import { getSession, homeForRole } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.role));
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">TDRA PE Registration Portal</p>
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Demo · admin@tdra.demo / Admin@12345 · pe.demo@acme.ae / PE@12345</p>
    </div>
  );
}
