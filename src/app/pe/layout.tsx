import { AppShell } from '@/components/AppShell';

export default function PeLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
