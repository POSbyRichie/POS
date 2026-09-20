import { UserRole } from '../types';
import { RoutePath } from '../routes/router';

export type PermissionId =
  | 'sales:create'
  | 'sales:refund'
  | 'sales:view'
  | 'inventory:view'
  | 'inventory:manage'
  | 'inventory:adjust'
  | 'shifts:open'
  | 'shifts:close'
  | 'shifts:view_all'
  | 'reports:view'
  | 'settings:manage'
  | 'users:manage'
  | 'system:diagnostics';

/**
 * Mapping of system roles to their authoritative permissions.
 */
export const ROLE_PERMISSIONS: Record<UserRole, PermissionId[]> = {
  admin: [
    'sales:create',
    'sales:refund',
    'sales:view',
    'inventory:view',
    'inventory:manage',
    'inventory:adjust',
    'shifts:open',
    'shifts:close',
    'shifts:view_all',
    'reports:view',
    'settings:manage',
    'users:manage',
    'system:diagnostics',
  ],
  manager: [
    'sales:create',
    'sales:refund',
    'sales:view',
    'inventory:view',
    'inventory:manage',
    'inventory:adjust',
    'shifts:open',
    'shifts:close',
    'shifts:view_all',
    'reports:view',
  ],
  cashier: [
    'sales:create',
    'sales:view',
    'shifts:open',
    'shifts:close',
    'inventory:view', // Selling info/stock status only
  ],
  inventory_manager: [
    'inventory:view',
    'inventory:manage',
    'inventory:adjust',
  ],
};

/**
 * Checks if a given role possesses a specific permission.
 */
export function hasPermission(role: UserRole | undefined | null, permission: PermissionId): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
}

/**
 * Mapping of routes to roles permitted to access them.
 */
export const ROUTE_ROLE_ACCESS: Record<RoutePath, UserRole[]> = {
  '/': ['admin', 'manager', 'cashier', 'inventory_manager'],
  '/dashboard': ['admin', 'manager', 'cashier', 'inventory_manager'],
  '/pos': ['admin', 'manager', 'cashier'],
  '/sales': ['admin', 'manager', 'cashier'],
  '/inventory': ['admin', 'manager', 'inventory_manager'],
  '/customers': ['admin', 'manager', 'cashier'],
  '/shifts': ['admin', 'manager', 'cashier'],
  '/reports': ['admin', 'manager'],
  '/admin': ['admin'],
  '/administration': ['admin'],
  '/settings': ['admin'],
  '/system': ['admin'],
};

/**
 * Checks if a given role is allowed to access a route.
 */
export function isRouteAllowed(role: UserRole | undefined | null, path: RoutePath): boolean {
  if (!role) return false;
  const allowedRoles = ROUTE_ROLE_ACCESS[path];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/**
 * Gets the designated default home route for a given user role upon login or redirection.
 */
export function getRoleHomeRoute(role: UserRole | undefined | null): RoutePath {
  switch (role) {
    case 'cashier':
      return '/pos';
    case 'inventory_manager':
      return '/inventory';
    case 'manager':
    case 'admin':
    default:
      return '/dashboard';
  }
}

/**
 * Maximum cart discount percent a cashier can apply without manager authorization.
 */
export const CASHIER_MAX_DISCOUNT_PERCENT = 15;

/**
 * Validates whether a cashier can apply the specified discount percentage.
 */
export function canApplyDiscount(role: UserRole, discountPercent: number): { allowed: boolean; reason?: string } {
  if (role === 'admin' || role === 'manager') {
    return { allowed: true };
  }
  if (discountPercent > CASHIER_MAX_DISCOUNT_PERCENT) {
    return {
      allowed: false,
      reason: `Discounts exceeding ${CASHIER_MAX_DISCOUNT_PERCENT}% require Manager authorization.`,
    };
  }
  return { allowed: true };
}
