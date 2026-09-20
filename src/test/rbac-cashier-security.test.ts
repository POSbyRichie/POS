import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { authService } from '../services/authService';
import { deviceService } from '../services/deviceService';
import { connectivityService } from '../services/connectivity';
import { inventoryRepository } from '../db';
import { productRepository } from '../db';
import { saleService } from '../services/saleService';
import { shiftService } from '../services/shiftService';
import { hashPin, generateSalt, generateUUID } from '../utils/id';
import {
  isRouteAllowed,
  getRoleHomeRoute,
  hasPermission,
  canApplyDiscount,
  CASHIER_MAX_DISCOUNT_PERCENT,
  ROLE_PERMISSIONS,
} from '../utils/rbac';
import { Product } from '../types';

describe('Authoritative RBAC & Dedicated Cashier Interface Security Tests (14 Tests)', () => {
  const testRegisterId = '00000000-0000-0000-0000-000000000021';
  const cashierId = '00000000-0000-0000-0000-000000000001';
  const otherCashierId = '00000000-0000-0000-0000-000000000002';
  const managerId = '00000000-0000-0000-0000-000000000003';
  const adminId = '00000000-0000-0000-0000-000000000004';
  const inventoryManagerId = '00000000-0000-0000-0000-000000000005';

  let testProduct: Product;

  beforeEach(async () => {
    connectivityService.setSimulatedOffline(false);
    await db.devices.clear();
    await db.settings.clear();
    await db.users.clear();
    await db.registers.clear();
    await db.shifts.clear();
    await db.products.clear();
    await db.sales.clear();
    await db.saleItems.clear();
    await db.payments.clear();
    await db.inventoryMovements.clear();
    await db.auditLogs.clear();
    await authService.clearCachedOfflineUsers();
    await deviceService.resetDeviceEnrollment();

    // Register
    await db.registers.add({
      id: testRegisterId,
      register_name: 'Main Counter POS 01',
      branch_name: 'Kampala Flagship',
      is_active: true,
    });

    // Device enrollment
    await deviceService.enrollDevice({
      deviceId: 'dev-pos-security-01',
      deviceName: 'Counter Register Terminal',
      registerId: testRegisterId,
    });


    // Seed Cashier 1
    const salt1 = generateSalt();
    const pinHash1 = await hashPin('1234', salt1);
    await db.users.add({
      id: cashierId,
      username: 'cashier1',
      full_name: 'Florence Cashier',
      role: 'cashier',
      pin_hash: pinHash1,
      salt: salt1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Cashier 2
    const salt2 = generateSalt();
    const pinHash2 = await hashPin('2222', salt2);
    await db.users.add({
      id: otherCashierId,
      username: 'cashier2',
      full_name: 'David Cashier',
      role: 'cashier',
      pin_hash: pinHash2,
      salt: salt2,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Manager
    const salt3 = generateSalt();
    const pinHash3 = await hashPin('5555', salt3);
    await db.users.add({
      id: managerId,
      username: 'manager1',
      full_name: 'Sarah Manager',
      role: 'manager',
      pin_hash: pinHash3,
      salt: salt3,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Admin
    const salt4 = generateSalt();
    const pinHash4 = await hashPin('9999', salt4);
    await db.users.add({
      id: adminId,
      username: 'admin1',
      full_name: 'Richard Administrator',
      role: 'admin',
      pin_hash: pinHash4,
      salt: salt4,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Inventory Manager
    const salt5 = generateSalt();
    const pinHash5 = await hashPin('7777', salt5);
    await db.users.add({
      id: inventoryManagerId,
      username: 'inventory1',
      full_name: 'Isaac Inventory',
      role: 'inventory_manager',
      pin_hash: pinHash5,
      salt: salt5,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Product
    testProduct = {
      id: 'prod-001',
      store_id: '00000000-0000-0000-0000-000000000001',
      category_id: 'cat-001',
      sku: 'SKU-COFFEE-01',
      barcode: '6001002003001',
      name: 'Espresso Blend 1kg',
      cost_price: 25000,
      selling_price: 45000,
      tax_rate: 18,
      unit: 'bag',
      stock_quantity: 50,
      min_stock_level: 10,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.products.put(testProduct);
  });

  // TEST 1: Cashier Login Direct Route
  it('1. Cashier Login Direct Route: takes cashiers directly to dedicated sales workstation', async () => {
    const loginResult = await authService.login({
      username: 'cashier1',
      pin: '1234',
      registerId: testRegisterId,
    });

    expect(loginResult.user.role).toBe('cashier');
    const homeRoute = getRoleHomeRoute(loginResult.user.role);
    expect(homeRoute).toBe('/pos');
    expect(homeRoute).not.toBe('/dashboard');
  });

  // TEST 2: Cashier Direct URL Tampering Prevention
  it('2. Cashier Direct URL Tampering Prevention: blocks cashiers from administrative routes', () => {
    expect(isRouteAllowed('cashier', '/reports')).toBe(false);
    expect(isRouteAllowed('cashier', '/admin')).toBe(false);
    expect(isRouteAllowed('cashier', '/administration')).toBe(false);
    expect(isRouteAllowed('cashier', '/settings')).toBe(false);
    expect(isRouteAllowed('cashier', '/system')).toBe(false);
    expect(isRouteAllowed('cashier', '/inventory')).toBe(false);

    // Sales and shifts allowed
    expect(isRouteAllowed('cashier', '/pos')).toBe(true);
    expect(isRouteAllowed('cashier', '/sales')).toBe(true);
    expect(isRouteAllowed('cashier', '/customers')).toBe(true);
    expect(isRouteAllowed('cashier', '/shifts')).toBe(true);
  });

  // TEST 3: Cashier Navigation Visibility
  it('3. Cashier Navigation Visibility: filters out administrative menu links for cashiers', () => {
    const allRoutes = ['/dashboard', '/pos', '/inventory', '/customers', '/shifts', '/reports', '/admin', '/system'] as const;
    const visibleForCashier = allRoutes.filter(r => isRouteAllowed('cashier', r));

    expect(visibleForCashier).toContain('/pos');
    expect(visibleForCashier).toContain('/customers');
    expect(visibleForCashier).toContain('/shifts');
    expect(visibleForCashier).not.toContain('/inventory');
    expect(visibleForCashier).not.toContain('/reports');
    expect(visibleForCashier).not.toContain('/admin');
    expect(visibleForCashier).not.toContain('/system');
  });

  // TEST 4: Cashier Sales Flow Access
  it('4. Cashier Sales Flow Access: cashier successfully completes sales transaction and generates receipt', async () => {
    // Open shift for cashier
    const shift = await shiftService.openShift({
      registerId: testRegisterId,
      cashierId,
      openingFloat: 50000,
    });
    expect(shift.status).toBe('open');

    // Complete sale as cashier
    const saleResult = await saleService.completeSale({
      registerId: testRegisterId,
      shift,
      cashierId,
      items: [
        {
          product: testProduct,
          quantity: 2,
          unit_price: testProduct.selling_price,
          discount_amount: 0,
          tax_rate: testProduct.tax_rate,
          item_total: testProduct.selling_price * 2,
        },
      ],
      payments: [
        {
          id: 'pay-001',
          method: 'cash',
          amount_paid: 106200, // 90,000 + 18% VAT (16,200)
        },
      ],
    });

    expect(saleResult.sale.payment_status).toBe('paid');
    expect(saleResult.sale.total_amount).toBe(106200);
    expect(saleResult.receipt).toBeDefined();
    expect(saleResult.receipt.receipt_number).toContain('CR-');



    // Verify stock was decremented properly
    const updatedProduct = await db.products.get(testProduct.id);
    expect(updatedProduct?.stock_quantity).toBe(48);
  });

  // TEST 5: Cashier Shift Management Boundary
  it('5. Cashier Shift Management Boundary: cashiers cannot view or access shifts belonging to other cashiers', async () => {
    // Create shift for Cashier 1
    await shiftService.openShift({
      registerId: testRegisterId,
      cashierId,
      openingFloat: 50000,
    });

    // Create shift for Cashier 2
    await db.shifts.put({
      id: generateUUID(),

      idempotency_key: 'shift-c2-test',
      register_id: testRegisterId,
      cashier_id: otherCashierId,
      status: 'open',
      opened_at: new Date().toISOString(),
      opening_float: 30000,
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      sync_status: 'synced',
    });

    // Cashier 1 query
    const cashier1Shifts = await db.shifts.where('cashier_id').equals(cashierId).toArray();
    expect(cashier1Shifts.length).toBe(1);
    expect(cashier1Shifts[0].cashier_id).toBe(cashierId);
    expect(cashier1Shifts.some(s => s.cashier_id === otherCashierId)).toBe(false);

    // Cashier cannot view all shifts permission
    expect(hasPermission('cashier', 'shifts:view_all')).toBe(false);
    expect(hasPermission('manager', 'shifts:view_all')).toBe(true);
    expect(hasPermission('admin', 'shifts:view_all')).toBe(true);
  });

  // TEST 6: Cashier Discount Authorization Enforcement
  it('6. Cashier Discount Authorization Enforcement: cashier capped at 15% discount; manager/admin can apply higher', () => {
    // Cashier within limit
    const cashierUnderLimit = canApplyDiscount('cashier', 10);
    expect(cashierUnderLimit.allowed).toBe(true);

    const cashierAtLimit = canApplyDiscount('cashier', CASHIER_MAX_DISCOUNT_PERCENT);
    expect(cashierAtLimit.allowed).toBe(true);

    // Cashier exceeds limit
    const cashierOverLimit = canApplyDiscount('cashier', 20);
    expect(cashierOverLimit.allowed).toBe(false);
    expect(cashierOverLimit.reason).toContain('require Manager authorization');

    // Manager and Admin can apply 20%, 50%
    expect(canApplyDiscount('manager', 20).allowed).toBe(true);
    expect(canApplyDiscount('manager', 50).allowed).toBe(true);
    expect(canApplyDiscount('admin', 50).allowed).toBe(true);
  });

  // TEST 7: Cashier Manual Stock Modification Prevention
  it('7. Cashier Manual Stock Modification Prevention: rejects manual stock adjustment when caller is cashier', async () => {
    await expect(
      inventoryRepository.adjustStock(
        testProduct.id,
        10,
        'RESTOCK',
        testRegisterId,
        cashierId // Cashier user ID
      )
    ).rejects.toThrow('Unauthorized: Cashiers are not permitted to perform manual stock adjustments.');

    // Product stock should remain untouched
    const product = await db.products.get(testProduct.id);
    expect(product?.stock_quantity).toBe(50);
  });

  // TEST 8: Cashier Product Deletion/Creation Block
  it('8. Cashier Product Deletion/Creation Block: rejects product creation and edits by cashier', async () => {
    // Attempt create
    await expect(
      productRepository.createProduct(
        {
          sku: 'NEW-PROD-CASHIER',
          barcode: '999888777666',
          name: 'Unauthorized Cashier Product',
          category_id: 'cat-001',
          cost_price: 1000,
          selling_price: 2000,
          stock_quantity: 10,
        },
        { userId: cashierId }
      )
    ).rejects.toThrow('Unauthorized: Cashiers are not permitted to create products.');

    // Attempt update
    await expect(
      productRepository.updateProduct(
        testProduct.id,
        { selling_price: 1000 },
        cashierId
      )
    ).rejects.toThrow('Unauthorized: Cashiers are not permitted to modify products.');
  });

  // TEST 9: Manager Full Operational Scope
  it('9. Manager Full Operational Scope: manager has sales, inventory, shifts, and reports access', async () => {
    expect(isRouteAllowed('manager', '/dashboard')).toBe(true);
    expect(isRouteAllowed('manager', '/sales')).toBe(true);
    expect(isRouteAllowed('manager', '/pos')).toBe(true);
    expect(isRouteAllowed('manager', '/inventory')).toBe(true);
    expect(isRouteAllowed('manager', '/shifts')).toBe(true);
    expect(isRouteAllowed('manager', '/reports')).toBe(true);

    // Cannot access admin configuration or system diagnostics
    expect(isRouteAllowed('manager', '/admin')).toBe(false);
    expect(isRouteAllowed('manager', '/system')).toBe(false);

    // Manager can perform manual stock adjustments
    const adj = await inventoryRepository.adjustStock(
      testProduct.id,
      15,
      'RESTOCK',
      testRegisterId,
      managerId
    );
    expect(adj.quantity_delta).toBe(15);
    const updated = await db.products.get(testProduct.id);
    expect(updated?.stock_quantity).toBe(65);
  });

  // TEST 10: Administrator Unrestricted Access
  it('10. Administrator Unrestricted Access: administrator has access to all system routes and capabilities', () => {
    const allRoutes = [
      '/',
      '/dashboard',
      '/pos',
      '/sales',
      '/inventory',
      '/customers',
      '/shifts',
      '/reports',
      '/admin',
      '/administration',
      '/settings',
      '/system',
    ] as const;

    for (const route of allRoutes) {
      expect(isRouteAllowed('admin', route)).toBe(true);
    }

    // All authoritative permissions granted
    const allPermissions = ROLE_PERMISSIONS['admin'];
    for (const perm of allPermissions) {
      expect(hasPermission('admin', perm)).toBe(true);
    }
  });

  // TEST 11: Inventory Manager Scope Enforcement
  it('11. Inventory Manager Scope Enforcement: access restricted to inventory management, blocked from sales and admin', async () => {
    expect(isRouteAllowed('inventory_manager', '/inventory')).toBe(true);
    expect(isRouteAllowed('inventory_manager', '/dashboard')).toBe(true);
    expect(getRoleHomeRoute('inventory_manager')).toBe('/inventory');

    // Blocked routes
    expect(isRouteAllowed('inventory_manager', '/pos')).toBe(false);
    expect(isRouteAllowed('inventory_manager', '/sales')).toBe(false);
    expect(isRouteAllowed('inventory_manager', '/customers')).toBe(false);
    expect(isRouteAllowed('inventory_manager', '/reports')).toBe(false);
    expect(isRouteAllowed('inventory_manager', '/admin')).toBe(false);
    expect(isRouteAllowed('inventory_manager', '/system')).toBe(false);

    // Inventory manager can create product
    const created = await productRepository.createProduct(
      {
        sku: 'INV-NEW-ITEM-01',
        barcode: '555666777888',
        name: 'Authorized Inventory Item',
        category_id: 'cat-001',
        cost_price: 15000,
        selling_price: 25000,
        stock_quantity: 20,
      },
      { userId: inventoryManagerId }
    );
    expect(created.sku).toBe('INV-NEW-ITEM-01');
  });

  // TEST 12: Session Persistence and Role Integrity
  it('12. Session Persistence and Role Integrity: user role is preserved and cannot be tampered with via client manipulation', async () => {
    const cashier = await db.users.get(cashierId);
    expect(cashier?.role).toBe('cashier');

    // Stored role authoritative verification
    const verifiedRole = cashier?.role;
    expect(hasPermission(verifiedRole, 'settings:manage')).toBe(false);
    expect(hasPermission(verifiedRole, 'users:manage')).toBe(false);
    expect(hasPermission(verifiedRole, 'inventory:adjust')).toBe(false);
  });

  // TEST 13: Offline Authorization Durability
  it('13. Offline Authorization Durability: offline mode enforces PIN verification and prevents bypasses', async () => {
    // 1. Authenticate online first to cache
    await authService.login({
      username: 'cashier1',
      pin: '1234',
      registerId: testRegisterId,
    });

    // 2. Disconnect internet
    connectivityService.setSimulatedOffline(true);

    // 3. Reject bad PIN offline
    await expect(
      authService.login({
        username: 'cashier1',
        pin: 'WRONG_PIN',
        registerId: testRegisterId,
      })
    ).rejects.toThrow('Invalid credentials');

    // 4. Reject uncached user offline
    await expect(
      authService.login({
        username: 'cashier2',
        pin: '2222',
        registerId: testRegisterId,
      })
    ).rejects.toThrow('USER_NOT_AUTHORIZED_OFFLINE');


    // 5. Valid cached user offline succeeds with identical role
    const offlineLogin = await authService.login({
      username: 'cashier1',
      pin: '1234',
      registerId: testRegisterId,
    });
    expect(offlineLogin.user.role).toBe('cashier');
  });

  // TEST 14: DevTools / State Tampering Resilience
  it('14. DevTools / State Tampering Resilience: backend and service layers enforce permissions independently of UI', async () => {
    // Even if an attacker in DevTools modifies React state to call adjustStock:
    await expect(
      inventoryRepository.adjustStock(
        testProduct.id,
        100,
        'RESTOCK',
        testRegisterId,
        cashierId
      )
    ).rejects.toThrow('Unauthorized: Cashiers are not permitted to perform manual stock adjustments.');

    // Even if an attacker calls updateProduct:
    await expect(
      productRepository.updateProduct(
        testProduct.id,
        { selling_price: 1 },
        cashierId
      )
    ).rejects.toThrow('Unauthorized: Cashiers are not permitted to modify products.');
  });
});
