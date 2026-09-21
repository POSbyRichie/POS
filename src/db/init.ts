import { db } from './index';
import { Role, Permission, RolePermission } from '../types';
import { logger } from '../utils/logger';
import {
  isDummyProduct,
  isDummyCategoryId,
  isDummyStore,
  isDummyRegister,
  isDummyUser,
} from '../utils/productionGuard';

const SYSTEM_EPOCH = '2026-01-01T00:00:00.000Z';

export const SYSTEM_ROLES: Role[] = [
  { id: 'admin', name: 'Administrator', description: 'Full system access and multi-store configuration', is_system: true, created_at: SYSTEM_EPOCH, updated_at: SYSTEM_EPOCH },
  { id: 'manager', name: 'Store Manager', description: 'Store management, shift overrides, inventory adjustments and reports', is_system: true, created_at: SYSTEM_EPOCH, updated_at: SYSTEM_EPOCH },
  { id: 'cashier', name: 'POS Cashier', description: 'Point of sale checkout, register shift management, customer enrollment', is_system: true, created_at: SYSTEM_EPOCH, updated_at: SYSTEM_EPOCH },
  { id: 'inventory_manager', name: 'Inventory Manager', description: 'Stock intake, supplier deliveries, damaged goods adjustment', is_system: true, created_at: SYSTEM_EPOCH, updated_at: SYSTEM_EPOCH },
];

export const SYSTEM_PERMISSIONS: Permission[] = [
  { id: 'sales:create', name: 'Create Sales', category: 'sales', description: 'Scan products and tender transactions', created_at: SYSTEM_EPOCH },
  { id: 'sales:refund', name: 'Refund Sales', category: 'sales', description: 'Process refunds and returns', created_at: SYSTEM_EPOCH },
  { id: 'sales:view', name: 'View Sales', category: 'sales', description: 'View transaction receipts and history', created_at: SYSTEM_EPOCH },
  { id: 'inventory:view', name: 'View Stock', category: 'inventory', description: 'Inspect real-time stock levels', created_at: SYSTEM_EPOCH },
  { id: 'inventory:adjust', name: 'Adjust Stock', category: 'inventory', description: 'Perform stock adjustments and damaged goods entry', created_at: SYSTEM_EPOCH },
  { id: 'shifts:open', name: 'Open Shifts', category: 'shifts', description: 'Open register work sessions with float', created_at: SYSTEM_EPOCH },
  { id: 'shifts:close', name: 'Close Shifts', category: 'shifts', description: 'Count drawer cash and close shifts', created_at: SYSTEM_EPOCH },
  { id: 'reports:view', name: 'View Reports', category: 'reports', description: 'Access financial and sales reconciliation reports', created_at: SYSTEM_EPOCH },
  { id: 'settings:manage', name: 'Manage Settings', category: 'admin', description: 'Modify store settings and hardware configurations', created_at: SYSTEM_EPOCH },
  { id: 'users:manage', name: 'Manage Staff', category: 'admin', description: 'Add and deactivate staff accounts', created_at: SYSTEM_EPOCH },
];

export const SYSTEM_ROLE_PERMISSIONS: RolePermission[] = [
  // Admin permissions (Full)
  { role_id: 'admin', permission_id: 'sales:create', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'sales:refund', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'sales:view', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'inventory:view', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'inventory:adjust', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'shifts:open', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'shifts:close', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'reports:view', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'settings:manage', created_at: SYSTEM_EPOCH },
  { role_id: 'admin', permission_id: 'users:manage', created_at: SYSTEM_EPOCH },

  // Manager permissions
  { role_id: 'manager', permission_id: 'sales:create', created_at: SYSTEM_EPOCH },
  { role_id: 'manager', permission_id: 'sales:refund', created_at: SYSTEM_EPOCH },
  { role_id: 'manager', permission_id: 'sales:view', created_at: SYSTEM_EPOCH },
  { role_id: 'manager', permission_id: 'inventory:view', created_at: SYSTEM_EPOCH },
  { role_id: 'manager', permission_id: 'inventory:adjust', created_at: SYSTEM_EPOCH },
  { role_id: 'manager', permission_id: 'shifts:open', created_at: SYSTEM_EPOCH },
  { role_id: 'manager', permission_id: 'shifts:close', created_at: SYSTEM_EPOCH },
  { role_id: 'manager', permission_id: 'reports:view', created_at: SYSTEM_EPOCH },

  // Cashier permissions
  { role_id: 'cashier', permission_id: 'sales:create', created_at: SYSTEM_EPOCH },
  { role_id: 'cashier', permission_id: 'sales:view', created_at: SYSTEM_EPOCH },
  { role_id: 'cashier', permission_id: 'shifts:open', created_at: SYSTEM_EPOCH },
  { role_id: 'cashier', permission_id: 'shifts:close', created_at: SYSTEM_EPOCH },

  // Inventory Manager permissions
  { role_id: 'inventory_manager', permission_id: 'inventory:view', created_at: SYSTEM_EPOCH },
  { role_id: 'inventory_manager', permission_id: 'inventory:adjust', created_at: SYSTEM_EPOCH },
];

/**
 * Production-ready initialization for fresh installations:
 * Pre-provisions system roles, permissions, and security mappings
 * with ZERO mock products, fake categories, fake customers, or demo transactions.
 * Automatically purges any legacy demo data if present from prior visits.
 */
export async function initializeProductionSystem(): Promise<void> {
  logger.info('SystemInit', 'Verifying production system baseline configuration...');

  // 1. Unconditionally purge any legacy dummy products that may exist
  const allProds = await db.products.toArray();
  const dummyProds = allProds.filter(isDummyProduct);
  if (dummyProds.length > 0) {
    logger.warn('SystemInit', `Purging ${dummyProds.length} legacy dummy products from local database`);
    await db.products.bulkDelete(dummyProds.map(p => p.id));
  }

  // 2. Unconditionally purge any legacy dummy categories that may exist
  const allCats = await db.categories.toArray();
  const dummyCats = allCats.filter(c => isDummyCategoryId(c.id));
  if (dummyCats.length > 0) {
    logger.warn('SystemInit', `Purging ${dummyCats.length} legacy dummy categories from local database`);
    await db.categories.bulkDelete(dummyCats.map(c => c.id));
  }

  // 3. Unconditionally purge any legacy dummy stores
  const allStores = await db.stores.toArray();
  const dummyStores = allStores.filter(isDummyStore);
  if (dummyStores.length > 0) {
    logger.warn('SystemInit', `Purging ${dummyStores.length} legacy dummy stores from local database`);
    await db.stores.bulkDelete(dummyStores.map(s => s.id));
  }

  // 4. Unconditionally purge any legacy dummy registers
  const allRegisters = await db.registers.toArray();
  const dummyRegisters = allRegisters.filter(isDummyRegister);
  if (dummyRegisters.length > 0) {
    logger.warn('SystemInit', `Purging ${dummyRegisters.length} legacy dummy registers from local database`);
    await db.registers.bulkDelete(dummyRegisters.map(r => r.id));
  }

  // 5. Unconditionally purge any legacy mock users
  const allUsers = await db.users.toArray();
  const dummyUsers = allUsers.filter(isDummyUser);
  if (dummyUsers.length > 0) {
    logger.warn('SystemInit', `Purging ${dummyUsers.length} legacy dummy users from local database`);
    await db.users.bulkDelete(dummyUsers.map(u => u.id));
  }

  // 6. Check if production v4 reset has run
  const hasCleanV4 = await db.settings.get('production_clean_v4');

  if (!hasCleanV4) {
    logger.warn('SystemInit', 'Executing complete production data cleanup...');
    await purgeMockBusinessRecords();
    await db.users.clear();
    await db.stores.clear();
    await db.registers.clear();
    await db.devices.clear();
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('pos_active_user_id');
        localStorage.removeItem('pos_enrolled_device_id');
        localStorage.removeItem('pos_device_fingerprint');
      } catch {
        // ignore
      }
    }
    await db.settings.put({ key: 'production_clean_v4', value: 'true' });
  }

  // 1. Ensure System Roles
  const rolesCount = await db.roles.count();
  if (rolesCount === 0) {
    await db.roles.bulkPut(SYSTEM_ROLES);
    logger.info('SystemInit', `Provisioned ${SYSTEM_ROLES.length} system roles`);
  }

  // 2. Ensure System Permissions
  const permissionsCount = await db.permissions.count();
  if (permissionsCount === 0) {
    await db.permissions.bulkPut(SYSTEM_PERMISSIONS);
    logger.info('SystemInit', `Provisioned ${SYSTEM_PERMISSIONS.length} system permissions`);
  }

  // 3. Ensure Role-Permission Mappings
  const rolePermCount = await db.rolePermissions.count();
  if (rolePermCount === 0) {
    await db.rolePermissions.bulkPut(SYSTEM_ROLE_PERMISSIONS);
    logger.info('SystemInit', `Provisioned ${SYSTEM_ROLE_PERMISSIONS.length} role-permission mappings`);
  }

  // 4. Mark System Initialized
  await db.settings.put({ key: 'system_initialized', value: 'true' });
  await db.settings.put({ key: 'system_version', value: '3.0.0' });
}

/**
 * Purges mock/demo business records from an active database if previously seeded,
 * preserving schema, roles, and permissions.
 */
export async function purgeMockBusinessRecords(): Promise<void> {
  logger.warn('SystemCleanup', 'Purging all mock business records...');

  await Promise.all([
    db.users.clear(),
    db.products.clear(),
    db.categories.clear(),
    db.inventory.clear(),
    db.inventoryMovements.clear(),
    db.sales.clear(),
    db.saleItems.clear(),
    db.payments.clear(),
    db.paymentItems.clear(),
    db.receipts.clear(),
    db.shifts.clear(),
    db.cashMovements.clear(),
    db.customers.clear(),
    db.loyaltyAccounts.clear(),
    db.loyaltyTransactions.clear(),
    db.auditLogs.clear(),
    db.emailQueue.clear(),
    db.smsQueue.clear(),
    db.syncQueue.clear(),
    db.syncErrors.clear(),
  ]);

  logger.info('SystemCleanup', 'Purge completed successfully.');
}
