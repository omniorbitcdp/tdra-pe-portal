// Role-scoped navigation. A queue manager sees ONLY the queue they own;
// the platform administrator sees everything.
import { MODULES_FOR_ROLE, type Role } from './constants';

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Exact-match only (used for workbench roots). */
  exact?: boolean;
  badge?: 'pending';
}
export interface NavGroup { title?: string; items: NavItem[]; }

export type IconName =
  | 'dashboard' | 'profile' | 'kyc' | 'header' | 'template' | 'url' | 'link'
  | 'settings' | 'api' | 'users' | 'audit' | 'bell' | 'queue';

const PE_NAV: NavGroup[] = [{
  title: 'Registration',
  items: [
    { label: 'Dashboard', href: '/pe', icon: 'dashboard', exact: true },
    { label: 'Entity & Signatory', href: '/pe/profile', icon: 'profile' },
    { label: 'KYC Documents', href: '/pe/kyc', icon: 'kyc' },
    { label: 'Headers', href: '/pe/headers', icon: 'header' },
    { label: 'Templates', href: '/pe/templates', icon: 'template' },
    { label: 'URLs', href: '/pe/urls', icon: 'url' },
  ],
}, {
  title: 'Subscriber care',
  items: [{ label: 'Grievances', href: '/pe/grievances', icon: 'bell' }],
}];

const QUEUE_ITEMS: Record<string, NavItem> = {
  KYC: { label: 'KYC Queue', href: '/operator/kyc', icon: 'kyc', badge: 'pending' },
  HEADER: { label: 'Header Queue', href: '/operator/headers', icon: 'header', badge: 'pending' },
  TEMPLATE: { label: 'Template Queue', href: '/operator/templates', icon: 'template', badge: 'pending' },
  URL: { label: 'URL Queue', href: '/operator/urls', icon: 'url', badge: 'pending' },
};

function operatorNav(role: Role): NavGroup[] {
  const modules = MODULES_FOR_ROLE[role] ?? [];
  const queue: NavGroup = {
    title: 'My approvals',
    items: [{ label: 'Workbench', href: '/operator', icon: 'dashboard', exact: true }, ...modules.map((m) => QUEUE_ITEMS[m])],
  };
  return [queue];
}

const ADMIN_NAV: NavGroup[] = [
  {
    title: 'Platform',
    items: [
      { label: 'Overview', href: '/admin', icon: 'dashboard', exact: true },
      { label: 'Branding & Settings', href: '/admin/settings', icon: 'settings' },
      { label: 'Email / SMS / WhatsApp APIs', href: '/admin/api-config', icon: 'api' },
      { label: 'Users & Roles', href: '/admin/users', icon: 'users' },
    ],
  },
  {
    title: 'Operator queues',
    items: [
      { label: 'Workbench', href: '/operator', icon: 'queue', exact: true },
      { label: 'KYC Queue', href: '/operator/kyc', icon: 'kyc' },
      { label: 'Header Queue', href: '/operator/headers', icon: 'header' },
      { label: 'Template Queue', href: '/operator/templates', icon: 'template' },
      { label: 'URL Queue', href: '/operator/urls', icon: 'url' },
    ],
  },
  {
    title: 'Oversight',
    items: [
      { label: 'Audit Trail', href: '/admin/audit', icon: 'audit' },
      { label: 'Notifications Log', href: '/admin/notifications', icon: 'bell' },
      { label: 'Grievances', href: '/admin/grievances', icon: 'bell' },
    ],
  },
];

export function navForRole(role: Role): NavGroup[] {
  switch (role) {
    case 'PE': return PE_NAV;
    case 'ADMIN': return ADMIN_NAV;
    case 'OPERATOR_KYC':
    case 'OPERATOR_HEADER':
    case 'OPERATOR_TEMPLATE_URL':
      return operatorNav(role);
    default: return [];
  }
}

/** Prefix the role may open (used for defensive checks in server components). */
export function canAccessPath(role: Role, path: string): boolean {
  return navForRole(role).some((g) => g.items.some((i) =>
    i.exact ? path === i.href : path === i.href || path.startsWith(i.href + '/')));
}
