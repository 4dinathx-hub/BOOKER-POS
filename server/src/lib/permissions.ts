// Central authorization source of truth. Every route declares the
// permission(s) it needs via requirePermission() in middleware/rbac.ts —
// nothing checks `role === 'MANAGER'` inline anywhere in a route handler.
// Restaurants can override the defaults below via the RolePermission table
// (Settings > Roles), which the middleware consults before falling back
// to this matrix.

export type ActorRole =
  | 'OWNER'          // Company owner — implicit all-permissions, not stored in DB
  | 'SUPER_ADMIN'    // Platform admin — implicit all-permissions, cross-tenant
  | 'MANAGER'
  | 'CAPTAIN'
  | 'WAITER'
  | 'CASHIER'
  | 'CHEF'
  | 'KITCHEN_STAFF'
  | 'HELPER';

export const PERMISSIONS = [
  'dashboard:read',
  'restaurant:read', 'restaurant:write',
  'branches:read', 'branches:write',
  'employees:read', 'employees:write', 'employees:roles',
  'menu:read', 'menu:write',
  'modifiers:read', 'modifiers:write',
  'recipes:read', 'recipes:write',
  'taxes:read', 'taxes:write',
  'pos:use', 'pos:config',
  'tables:read', 'tables:write',
  'kitchen:read', 'kitchen:update_status',
  'inventory:read', 'inventory:write', 'inventory:adjust',
  'warehouse:read', 'warehouse:write',
  'purchase_orders:read', 'purchase_orders:write',
  'suppliers:read', 'suppliers:write',
  'customers:read', 'customers:write',
  'loyalty:read', 'loyalty:write',
  'coupons:read', 'coupons:write',
  'online_orders:read', 'online_orders:write',
  'reports:read',
  'attendance:read', 'attendance:approve',
  'payroll:read', 'payroll:write',
  'settings:read', 'settings:write',
  'printing:read', 'printing:write',
  'audit_logs:read',
  'notifications:read',
  'orders:read', 'orders:write', 'orders:void', 'orders:refund',
  'finance:read', 'finance:write',
  'feedback:read',
  'marketing:read', 'marketing:write',
] as const;

export type Permission = typeof PERMISSIONS[number];

// Sensible defaults per staff role — restaurants can narrow/widen these via
// RolePermission rows without a code change.
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<ActorRole, 'OWNER' | 'SUPER_ADMIN'>, Permission[]> = {
  MANAGER: [
    'dashboard:read', 'restaurant:read', 'branches:read',
    'employees:read', 'employees:write',
    'menu:read', 'menu:write', 'modifiers:read', 'modifiers:write',
    'recipes:read', 'recipes:write', 'taxes:read', 'taxes:write',
    'pos:use', 'pos:config', 'tables:read', 'tables:write',
    'kitchen:read', 'kitchen:update_status',
    'inventory:read', 'inventory:write', 'inventory:adjust',
    'warehouse:read', 'warehouse:write',
    'purchase_orders:read', 'purchase_orders:write',
    'suppliers:read', 'suppliers:write',
    'customers:read', 'customers:write', 'loyalty:read', 'loyalty:write',
    'coupons:read', 'coupons:write', 'online_orders:read', 'online_orders:write',
    'reports:read', 'attendance:read', 'attendance:approve',
    'payroll:read', 'payroll:write', 'settings:read', 'settings:write',
    'printing:read', 'printing:write', 'audit_logs:read', 'notifications:read',
    'orders:read', 'orders:write', 'orders:void', 'orders:refund',
    'finance:read', 'finance:write', 'feedback:read', 'marketing:read', 'marketing:write',
  ],
  CASHIER: [
    'dashboard:read', 'menu:read', 'pos:use', 'tables:read',
    'customers:read', 'customers:write', 'loyalty:read', 'coupons:read',
    'orders:read', 'orders:write', 'orders:void',
    'inventory:read', 'notifications:read',
  ],
  CAPTAIN: [
    'menu:read', 'pos:use', 'tables:read', 'tables:write',
    'orders:read', 'orders:write', 'customers:read', 'notifications:read',
  ],
  WAITER: [
    'menu:read', 'tables:read', 'orders:read', 'orders:write', 'notifications:read',
  ],
  CHEF: [
    'kitchen:read', 'kitchen:update_status', 'menu:read',
    'inventory:read', 'recipes:read', 'notifications:read',
  ],
  KITCHEN_STAFF: [
    'kitchen:read', 'kitchen:update_status', 'notifications:read',
  ],
  HELPER: [
    'kitchen:read', 'notifications:read',
  ],
};

export function isImplicitFullAccess(role: ActorRole): boolean {
  return role === 'OWNER' || role === 'SUPER_ADMIN';
}
