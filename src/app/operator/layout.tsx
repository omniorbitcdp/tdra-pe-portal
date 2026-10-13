import { Shell } from '@/components/Shell';
import { Tabs } from '@/components/nav';

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Tabs items={[
        { href: '/operator', label: 'Overview' },
        { href: '/operator/kyc', label: 'KYC Queue' },
        { href: '/operator/headers', label: 'Header Queue' },
        { href: '/operator/templates', label: 'Template Queue' },
        { href: '/operator/urls', label: 'URL Queue' },
      ]} />
      {children}
    </Shell>
  );
}
