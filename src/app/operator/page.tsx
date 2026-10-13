import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { PageHeader, Card } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function OperatorHome() {
  const session = await getSession();
  if (!session) redirect('/login');
  const links = [
    { href: '/operator/kyc', title: 'KYC Queue', desc: 'Split-screen review of PE details and the four mandatory TDRA documents.' },
    { href: '/operator/headers', title: 'Header Queue', desc: 'Approve, reject or return header registration requests.' },
    { href: '/operator/templates', title: 'Template Queue', desc: 'Review template registrations submitted against approved headers.' },
    { href: '/operator/urls', title: 'URL Queue', desc: 'Review URL registrations submitted against approved templates.' },
  ];
  return (
    <Shell>
      <PageHeader title="Telecom Operator Back Office" subtitle={ROLE_LABELS[session.role]} />
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="card p-5 transition hover:shadow-md">
            <div className="text-base font-semibold brand-text">{l.title}</div>
            <p className="mt-1 text-sm text-slate-600">{l.desc}</p>
          </a>
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-500">Role separation is enforced server-side: you can only action queues permitted by your role.</p>
    </Shell>
  );
}
