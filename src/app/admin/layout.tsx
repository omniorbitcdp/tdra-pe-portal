import { Shell } from '@/components/Shell';
import { Tabs } from '@/components/nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Tabs items={[
        { href: '/admin', label: 'Overview' },
        { href: '/admin/settings', label: 'Branding & Settings' },
        { href: '/admin/api-config', label: 'Email / SMS / WhatsApp APIs' },
        { href: '/admin/users', label: 'Users & Roles' },
        { href: '/admin/audit', label: 'Audit Trail' },
        { href: '/admin/notifications', label: 'Notifications Log' },
      ]} />
      {children}
    </Shell>
  );
}
