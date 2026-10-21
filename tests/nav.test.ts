import { describe, it, expect } from 'vitest';
import { navForRole, canAccessPath } from '@/lib/nav';
import { MODULES_FOR_ROLE, HOME_FOR_ROLE } from '@/lib/constants';

const hrefs = (role: Parameters<typeof navForRole>[0]) => navForRole(role).flatMap((g) => g.items.map((i) => i.href));

describe('role-scoped navigation', () => {
  it('gives each operator ONLY their own queue', () => {
    expect(hrefs('OPERATOR_KYC')).toEqual(['/operator', '/operator/kyc']);
    expect(hrefs('OPERATOR_HEADER')).toEqual(['/operator', '/operator/headers']);
    expect(hrefs('OPERATOR_TEMPLATE_URL')).toEqual(['/operator', '/operator/templates', '/operator/urls']);
  });

  it('does not leak other queues into an operator nav', () => {
    expect(hrefs('OPERATOR_KYC')).not.toContain('/operator/headers');
    expect(hrefs('OPERATOR_HEADER')).not.toContain('/operator/kyc');
    expect(hrefs('OPERATOR_TEMPLATE_URL')).not.toContain('/operator/kyc');
  });

  it('lets the admin see every queue plus platform screens', () => {
    const admin = hrefs('ADMIN');
    expect(admin).toContain('/admin/settings');
    expect(admin).toContain('/admin/audit');
    expect(admin).toContain('/operator/kyc');
    expect(admin).toContain('/operator/urls');
  });

  it('maps a PE to the six registration screens plus subscriber care', () => {
    const groups = navForRole('PE');
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    for (const h of ['/pe', '/pe/profile', '/pe/kyc', '/pe/headers', '/pe/templates', '/pe/urls']) {
      expect(hrefs).toContain(h);
    }
    expect(hrefs).toContain('/pe/grievances');
    expect(hrefs).not.toContain('/admin');
    expect(hrefs).not.toContain('/operator');
  });

  it('canAccessPath respects exact vs prefix matches', () => {
    expect(canAccessPath('OPERATOR_KYC', '/operator/kyc')).toBe(true);
    expect(canAccessPath('OPERATOR_KYC', '/operator/kyc/abc-123')).toBe(true);
    expect(canAccessPath('OPERATOR_KYC', '/operator/headers')).toBe(false);
    expect(canAccessPath('PE', '/pe')).toBe(true);
    expect(canAccessPath('PE', '/admin')).toBe(false);
  });

  it('modules per role match the documented ownership', () => {
    expect(MODULES_FOR_ROLE.OPERATOR_KYC).toEqual(['KYC']);
    expect(MODULES_FOR_ROLE.OPERATOR_HEADER).toEqual(['HEADER']);
    expect(MODULES_FOR_ROLE.OPERATOR_TEMPLATE_URL).toEqual(['TEMPLATE', 'URL']);
    expect(MODULES_FOR_ROLE.ADMIN).toHaveLength(4);
    expect(HOME_FOR_ROLE.PE).toBe('/pe');
  });
});
