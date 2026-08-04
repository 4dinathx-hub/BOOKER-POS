import { describe, it, expect } from 'vitest';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, isImplicitFullAccess } from '../src/lib/permissions';

describe('permissions matrix', () => {
  it('OWNER and SUPER_ADMIN get implicit full access', () => {
    expect(isImplicitFullAccess('OWNER')).toBe(true);
    expect(isImplicitFullAccess('SUPER_ADMIN')).toBe(true);
  });

  it('staff roles do not get implicit full access', () => {
    for (const role of ['MANAGER', 'CAPTAIN', 'WAITER', 'CASHIER', 'CHEF', 'KITCHEN_STAFF', 'HELPER'] as const) {
      expect(isImplicitFullAccess(role)).toBe(false);
    }
  });

  it('every permission granted to a role actually exists in PERMISSIONS', () => {
    const known = new Set(PERMISSIONS);
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        expect(known.has(perm), `${role} references unknown permission "${perm}"`).toBe(true);
      }
    }
  });

  it('MANAGER has broader access than front-of-house roles', () => {
    const managerPerms = new Set(DEFAULT_ROLE_PERMISSIONS.MANAGER);
    for (const role of ['CAPTAIN', 'WAITER', 'CASHIER'] as const) {
      for (const perm of DEFAULT_ROLE_PERMISSIONS[role]) {
        expect(managerPerms.has(perm), `MANAGER is missing "${perm}" that ${role} has`).toBe(true);
      }
    }
  });

  it('KITCHEN_STAFF cannot access financial or settings permissions', () => {
    const kitchenPerms = DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF;
    for (const forbidden of ['finance:read', 'finance:write', 'settings:write', 'payroll:read']) {
      expect(kitchenPerms).not.toContain(forbidden);
    }
  });
});
