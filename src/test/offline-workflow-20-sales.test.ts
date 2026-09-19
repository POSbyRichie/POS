import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { seedDatabase } from '../db/seed';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import { syncService } from '../services/syncService';
import { connectivityService } from '../services/connectivity';
import { Shift, Product, Customer } from '../types';
import { generateUUID } from '../utils/id';

describe('Authoritative 20 Offline Sales & E2E Reopening Reconciliation Test', () => {
  let activeShift: Shift;
  let cashierUser: any;
  let register: any;
  let products: Product[];

  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedDatabase(true);

    cashierUser = await db.users.where('role').equals('cashier').first();
    register = await db.registers.get('reg-001-main');
    products = await db.products.toArray();

    // Step 2: Open Shift
    const shiftId = generateUUID();
    activeShift = {
      id: shiftId,
      idempotency_key: `shift-${shiftId}`,
      register_id: register.id,
      cashier_id: cashierUser.id,
      status: 'open',
      opened_at: new Date().toISOString(),
      opening_float: 50000,
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      sync_status: 'pending',
    };
    await db.shifts.put(activeShift);
  });

  it('executes at least 20 consecutive offline sales, survives DB reload, creates offline customers, closes shift, and syncs idempotently', async () => {
    // 1. Turn internet completely OFF
    connectivityService.setSimulatedOffline(true);
    expect(connectivityService.isOnline()).toBe(false);

    // Pick a product with sufficient stock (Mineral Water 45 units)
    const product0 = products.find(p => p.sku === 'BEV-001') || products[0];
    const initialStockProduct0 = product0.stock_quantity;
    expect(initialStockProduct0).toBeGreaterThanOrEqual(20);

    const completedSaleIds: string[] = [];

    // 2. Perform 20 complete sales while completely OFFLINE
    for (let i = 1; i <= 20; i++) {
      // Step 6 Check Stock
      const stockCheck = await inventoryService.checkStock(product0.id);
      expect(stockCheck.inStock).toBe(true);

      const itemQty = 1;
      const cartItem = {
        product: product0,
        quantity: itemQty,
        unit_price: product0.selling_price,
        discount_amount: 0,
        tax_rate: product0.tax_rate,
        item_total: product0.selling_price * itemQty,
      };

      const cartTotals = (await import('../utils/money')).calculateCartTotals([cartItem]);
      const grandTotal = cartTotals.grandTotal;

      const result = await saleService.completeSale({
        items: [cartItem],
        payments: [
          {
            id: `p-${i}`,
            method: i % 2 === 0 ? 'cash' : 'card',
            amount_paid: grandTotal,
            reference: i % 2 === 0 ? undefined : `AUTH-TEST-${i}`,
          },
        ],
        shift: activeShift,
        registerId: register.id,
        cashierId: cashierUser.id,
        notes: `Offline Test Sale #${i}`,
      });

      expect(result.sale).toBeDefined();
      expect(result.sale.payment_status).toBe('paid');
      expect(result.receipt).toBeDefined();
      expect(result.receipt.receipt_number).toBeDefined();
      completedSaleIds.push(result.sale.id);
    }

    // Verify exactly 20 sales exist locally
    expect(completedSaleIds.length).toBe(20);
    const localSalesBeforeReload = await db.sales.toArray();
    expect(localSalesBeforeReload.length).toBe(20);

    // Verify product 0 stock decremented by exactly 20 units
    const updatedProd0 = await db.products.get(product0.id);
    expect(updatedProd0?.stock_quantity).toBe(initialStockProduct0 - 20);

    // 3. Step: Create additional customer OFFLINE
    const offlineCustId = generateUUID();
    const offlineCustomer: Customer = {
      id: offlineCustId,
      name: 'Offline VIP Shopper',
      phone: '+256 788 999 888',
      loyalty_number: 'LOYAL-OFFLINE-01',
      loyalty_points: 0,
      sync_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.customers.put(offlineCustomer);

    // 4. Simulate application restart / page refresh:
    // Create an independent database instance connecting to the same underlying IndexedDB store
    const { PosDatabase } = await import('../db');
    const reloadedDb = new PosDatabase();
    await reloadedDb.open();

    // Confirm all 20 sales and offline customer STILL EXIST in IndexedDB
    const localSalesAfterReload = await reloadedDb.sales.toArray();
    expect(localSalesAfterReload.length).toBe(20);

    const reloadedCust = await reloadedDb.customers.get(offlineCustId);
    expect(reloadedCust).toBeDefined();
    expect(reloadedCust?.name).toBe('Offline VIP Shopper');

    // 5. Authoritative Step 18: Close the Shift
    const currentShiftState = await db.shifts.get(activeShift.id);
    expect(currentShiftState?.transaction_count).toBe(20);
    const expectedDrawerCash = (currentShiftState?.opening_float || 0) + (currentShiftState?.cash_sales_total || 0);

    // Cashier counts cash and closes shift
    await db.shifts.update(activeShift.id, {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closing_cash_actual: expectedDrawerCash,
      closing_cash_expected: expectedDrawerCash,
      variance: 0,
    });

    const closedShift = await db.shifts.get(activeShift.id);
    expect(closedShift?.status).toBe('closed');
    expect(closedShift?.variance).toBe(0);

    // 6. Turn internet back ON (triggers auto-sync via subscriber)
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');
    expect(connectivityService.isOnline()).toBe(true);

    // Wait for sync queue worker to process all pending items
    for (let attempts = 0; attempts < 30; attempts++) {
      const pending = await db.syncQueue.where('status').equals('pending').count();
      if (pending === 0) break;
      await syncService.processQueue();
      await new Promise(r => setTimeout(r, 80));
    }

    // 7. Verify all sales in database are now marked synced
    const allSalesAfterSync = await db.sales.toArray();
    expect(allSalesAfterSync.length).toBe(20);
    for (const s of allSalesAfterSync) {
      expect(s.sync_status).toBe('synced');
    }

    // Verify all sync queue items are marked synced
    const pendingInQueue = await db.syncQueue.where('status').equals('pending').count();
    expect(pendingInQueue).toBe(0);

    const syncedInQueue = await db.syncQueue.where('status').equals('synced').count();
    expect(syncedInQueue).toBeGreaterThanOrEqual(20);

    // 8. Test Idempotency: re-running sync must NOT duplicate any sales or movements!
    const syncResult2 = await syncService.processQueue();
    expect(syncResult2.processed).toBe(0); // Queue is already processed

    const allSalesFinalCheck = await db.sales.toArray();
    expect(allSalesFinalCheck.length).toBe(20); // No duplicates!
  });
});
