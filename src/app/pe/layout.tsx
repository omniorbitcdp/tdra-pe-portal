import { Shell } from '@/components/Shell';
import { Tabs } from '@/components/nav';

export default function PeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Tabs items={[
        { href: '/pe', label: 'Dashboard' },
        { href: '/pe/profile', label: 'Entity & Signatory' },
        { href: '/pe/kyc', label: 'KYC Documents' },
        { href: '/pe/headers', label: 'Headers' },
        { href: '/pe/templates', label: 'Templates' },
        { href: '/pe/urls', label: 'URLs' },
      ]} />
      {children}
    </Shell>
  );
}
