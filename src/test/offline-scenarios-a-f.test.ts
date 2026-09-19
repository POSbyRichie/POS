import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PosDatabase } from '../db/database';
import { SalesRepository } from '../db/repositories/salesRepository';
import { ShiftRepository } from '../db/repositories/shiftRepository';
import { SyncEngine } from '../sync/syncEngine';
import { SyncQueue } from '../sync/syncQueue';
import { InventoryReconciliationEngine } from '../sync/inventoryReconciliation';
import { connectivityService } from '../services/connectivity';
import { Register, Product, User, Shift, SyncTelemetry, InventoryMovement } from '../types';

describe('Authoritative Offline Scenarios A through F Test Suite', () => {
  let testDb: PosDatabase;
  let salesRepo: SalesRepository;
  let shiftRepo: ShiftRepository;
  let syncQueue: SyncQueue;
  let syncEngine: SyncEngine;
  let reconciler: InventoryReconciliationEngine;

  let register: Register;
  let cashier: User;
  let productMineralWater: Product;
  let productLimitedStock: Product;
  let shift: Shift;

  beforeEach(async () => {
    const dbName = `test-scenarios-af-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDb = new PosDatabase(dbName);
    await testDb.open();

    salesRepo = new SalesRepository(testDb);
    shiftRepo = new ShiftRepository(testDb);
    syncQueue = new SyncQueue(testDb);
    syncEngine = new SyncEngine(testDb, syncQueue);
    reconciler = new InventoryReconciliationEngine();

    register = {
      id: 'reg-scenarios-01',
      register_name: 'Counter Terminal 1',
      branch_name: 'Kampala Flagship',
      is_active: true,
    };
    await testDb.registers.put(register);

    cashier = {
      id: 'usr-cashier-01',
      username: 'rcashier',
      full_name: 'Robert Cashier',
      name: 'Robert Cashier',
      role: 'cashier',
      pin_hash: '1234',
      salt: 'salt123',
      is_active: true,
    };
    await testDb.users.put(cashier);

    // High stock product for Scenarios A - E
    productMineralWater = {
      id: 'prod-water-01',
      sku: 'WATER-001',
      barcode: '600111222333',
      name: 'Rwenzori Mineral Water 500ml',
      category_id: 'cat-bev',
      cost_price: 800,
      selling_price: 1500,
      tax_rate: 0,
      unit: 'bottle',
      stock_quantity: 100,
      min_stock_level: 10,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(productMineralWater);

    // Limited stock product for Scenario F (Stock = 5)
    productLimitedStock = {
      id: 'prod-limited-01',
      sku: 'LIMITED-001',
      barcode: '600999888777',
      name: 'Limited Edition Thermal Flask',
      category_id: 'cat-gear',
      cost_price: 25000,
      selling_price: 45000,
      tax_rate: 0,
      unit: 'item',
      stock_quantity: 5, // Exactly 5 in stock!
      min_stock_level: 2,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(productLimitedStock);

    shift = await shiftRepo.openShift({
      registerId: register.id,
      cashierId: cashier.id,
      openingFloat: 50000,
    });
  });

  afterEach(async () => {
    syncEngine?.destroy();
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');
    if (testDb.isOpen()) {
      await testDb.close();
    }
  });

  /**
   * TEST A:
   * Internet OFF.
   * Make one sale.
   * Expected: Sale completed.
   * Not: Network error.
   */
  it('Test A: completes sale locally when internet is OFF without throwing network errors', async () => {
    // 1. Turn internet OFF
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');
    expect(connectivityService.isOnline()).toBe(false);

    // 2. Perform 1 sale
    let saleError: unknown = null;
    let saleResult: any = null;

    try {
      saleResult = await salesRepo.createSaleTransaction({
        items: [
          {
            product: productMineralWater,
            quantity: 1,
            unit_price: 1500,
            discount_amount: 0,
            tax_rate: 0,
            item_total: 1500,
          },
        ],
        payments: [{ id: 'p-test-a', method: 'cash', amount_paid: 1500 }],
        shift,
        registerId: register.id,
        cashierId: cashier.id,
        notes: 'Test A Single Offline Sale',
      });
    } catch (err) {
      saleError = err;
    }

    // Expected: Sale completed. NOT: Network error.
    expect(saleError).toBeNull();
    expect(saleResult).toBeDefined();
    expect(saleResult.sale.payment_status).toBe('paid');
    expect(saleResult.sale.sync_status).toBe('pending');
    expect(saleResult.sale.receipt_number).toBeDefined();
    expect(saleResult.receipt).toBeDefined();

    // Verify local stock decremented from 100 to 99
    const prodInDb = await testDb.products.get(productMineralWater.id);
    expect(prodInDb?.stock_quantity).toBe(99);

    // Verify exactly 1 pending mutation in sync queue
    const queuedItems = await testDb.syncQueue.toArray();
    expect(queuedItems.some(q => q.entity_type === 'sale' && q.entity_id === saleResult.sale.id)).toBe(true);
  });

  /**
   * TEST B:
   * Internet OFF.
   * Make 20 sales.
   * Expected: 20 sales stored locally.
   */
  it('Test B: stores exactly 20 sales locally when internet is OFF', async () => {
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');
    expect(connectivityService.isOnline()).toBe(false);

    const initialStock = productMineralWater.stock_quantity; // 100

    // Perform 20 sales consecutively while offline
    for (let i = 1; i <= 20; i++) {
      await salesRepo.createSaleTransaction({
        items: [
          {
            product: productMineralWater,
            quantity: 1,
            unit_price: 1500,
            discount_amount: 0,
            tax_rate: 0,
            item_total: 1500,
          },
        ],
        payments: [{ id: `p-test-b-${i}`, method: i % 2 === 0 ? 'cash' : 'card', amount_paid: 1500 }],
        shift,
        registerId: register.id,
        cashierId: cashier.id,
        notes: `Offline Sale #${i}`,
      });
    }

    // Expected: 20 sales stored locally
    const storedSales = await testDb.sales.toArray();
    expect(storedSales.length).toBe(20);

    const storedReceipts = await testDb.receipts.toArray();
    expect(storedReceipts.length).toBe(20);

    // All must be marked 'pending'
    for (const sale of storedSales) {
      expect(sale.sync_status).toBe('pending');
    }

    // Stock decremented by exactly 20: 100 - 20 = 80
    const updatedProd = await testDb.products.get(productMineralWater.id);
    expect(updatedProd?.stock_quantity).toBe(initialStock - 20);

    // Shift aggregates reflect all 20 sales
    const updatedShift = await testDb.shifts.get(shift.id);
    expect(updatedShift?.transaction_count).toBe(20);
    expect(updatedShift?.total_sales).toBe(20 * 1500);
  });

  /**
   * TEST C:
   * Internet OFF.
   * Close application.
   * Open application again.
   * Expected: All local transactions remain.
   */
  it('Test C: preserves all 20 local transactions across application teardown and restart while offline', async () => {
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');

    // 1. Create 20 sales
    for (let i = 1; i <= 20; i++) {
      await salesRepo.createSaleTransaction({
        items: [
          {
            product: productMineralWater,
            quantity: 1,
            unit_price: 1500,
            discount_amount: 0,
            tax_rate: 0,
            item_total: 1500,
          },
        ],
        payments: [{ id: `p-test-c-${i}`, method: 'cash', amount_paid: 1500 }],
        shift,
        registerId: register.id,
        cashierId: cashier.id,
        notes: `Preservation Sale #${i}`,
      });
    }

    expect((await testDb.sales.toArray()).length).toBe(20);

    // 2. CLOSE APPLICATION (Simulate app shutdown / process termination)
    syncEngine.destroy();
    const dbName = testDb.name;
    await testDb.close();
    expect(testDb.isOpen()).toBe(false);

    // 3. OPEN APPLICATION AGAIN (Simulate reopening app on device)
    testDb = new PosDatabase(dbName);
    await testDb.open();
    expect(testDb.isOpen()).toBe(true);

    // Expected: All local transactions remain completely intact
    const reloadedSales = await testDb.sales.toArray();
    expect(reloadedSales.length).toBe(20);

    const reloadedReceipts = await testDb.receipts.toArray();
    expect(reloadedReceipts.length).toBe(20);

    const reloadedPayments = await testDb.payments.toArray();
    expect(reloadedPayments.length).toBe(20);

    const reloadedQueue = await testDb.syncQueue.toArray();
    const pendingSalesQueue = reloadedQueue.filter(q => q.entity_type === 'sale');
    expect(pendingSalesQueue.length).toBe(20);

    for (const s of reloadedSales) {
      expect(s.sync_status).toBe('pending');
      expect(s.payment_status).toBe('paid');
    }
  });

  /**
   * TEST D:
   * Internet returns.
   * Expected:
   * 20 pending
   * ↓
   * Synchronizing
   * ↓
   * 20 synchronized
   */
  it('Test D: transitions through 20 pending -> Synchronizing -> 20 synchronized when internet returns', async () => {
    // 1. Start OFFLINE and create 20 sales
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');

    for (let i = 1; i <= 20; i++) {
      await salesRepo.createSaleTransaction({
        items: [
          {
            product: productMineralWater,
            quantity: 1,
            unit_price: 1500,
            discount_amount: 0,
            tax_rate: 0,
            item_total: 1500,
          },
        ],
        payments: [{ id: `p-test-d-${i}`, method: 'cash', amount_paid: 1500 }],
        shift,
        registerId: register.id,
        cashierId: cashier.id,
      });
    }

    // Capture telemetry stages across transition
    const observedStages: string[] = [];
    const observedMessages: string[] = [];

    const unsubscribe = syncEngine.subscribeTelemetry((telemetry: SyncTelemetry) => {
      observedStages.push(telemetry.stage);
      observedMessages.push(telemetry.statusMessage);
    });

    // Verify initial offline state: "20 pending"
    await syncEngine.notifyNewTransaction();
    expect(observedStages).toContain('offline_pending');
    expect(observedMessages.some(m => m.includes('20 transactions waiting to sync'))).toBe(true);

    // 2. INTERNET RETURNS
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');
    expect(connectivityService.isOnline()).toBe(true);

    // 3. SYNCHRONIZING
    const syncResult = await syncEngine.processQueue();
    expect(syncResult.processed).toBeGreaterThanOrEqual(20);
    expect(syncResult.errors).toBe(0);

    // Expected pipeline progression:
    // 20 pending -> Synchronizing -> 20 synchronized
    expect(observedStages).toContain('syncing');
    expect(observedStages).toContain('synchronized');
    expect(observedMessages).toContain('All transactions synchronized');

    // Verify all 20 local sales are now marked 'synced'
    const salesAfterSync = await testDb.sales.toArray();
    expect(salesAfterSync.length).toBe(20);
    for (const sale of salesAfterSync) {
      expect(sale.sync_status).toBe('synced');
    }

    unsubscribe();
  });

  /**
   * TEST E:
   * Internet repeatedly disconnects during synchronization.
   * Expected: No duplicate sales.
   */
  it('Test E: guarantees zero duplicate sales when internet repeatedly disconnects mid-synchronization', async () => {
    // 1. Create 5 offline sales
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');

    const createdSales: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await salesRepo.createSaleTransaction({
        items: [
          {
            product: productMineralWater,
            quantity: 1,
            unit_price: 1500,
            discount_amount: 0,
            tax_rate: 0,
            item_total: 1500,
          },
        ],
        payments: [{ id: `p-test-e-${i}`, method: 'cash', amount_paid: 1500 }],
        shift,
        registerId: register.id,
        cashierId: cashier.id,
        notes: `Disconnect Test Sale #${i}`,
      });
      createdSales.push(res.sale.id);
    }

    expect((await testDb.sales.toArray()).length).toBe(5);

    // 2. Simulate intermittent connection:
    // Turn online briefly
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');

    // Simulate disconnect mid-processing
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');

    // Re-run sync while offline -> should halt gracefully without duplicate entries
    await syncEngine.processQueue();

    // Reconnect internet
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');

    // Complete remaining queue
    await syncEngine.processQueue();

    // Repeat disconnect & reconnect attempt (idempotency replay test)
    connectivityService.setSimulatedOffline(true);
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');
    await syncEngine.processQueue();

    // Expected: No duplicate sales! Exactly 5 unique sales records
    const finalSales = await testDb.sales.toArray();
    expect(finalSales.length).toBe(5);

    const saleIds = finalSales.map(s => s.id);
    const uniqueIds = new Set(saleIds);
    expect(uniqueIds.size).toBe(5);

    // Idempotency keys must be unique
    const idemKeys = finalSales.map(s => s.idempotency_key);
    expect(new Set(idemKeys).size).toBe(5);

    // Receipts count must remain exactly 5
    const finalReceipts = await testDb.receipts.toArray();
    expect(finalReceipts.length).toBe(5);

    // All sales are successfully synced
    for (const sale of finalSales) {
      expect(sale.sync_status).toBe('synced');
    }
  });

  /**
   * TEST F:
   * Two POS terminals sell the same limited-stock product while offline.
   * This is a difficult real-world case.
   * The system needs an explicit business rule for offline stock conflicts.
   *
   * For example:
   * Terminal A: Stock locally = 5, sells 4.
   * Terminal B: Stock locally = 5, sells 4.
   * Server eventually receives: A = -4, B = -4.
   * Actual stock = -3.
   * The system must detect this rather than silently claiming everything is correct.
   * That is why inventory movements and reconciliation are preferable to simply
   * synchronizing a stock_quantity field.
   */
  it('Test F: multi-terminal concurrent offline sales detect negative stock deficit (-3) via inventory movements', async () => {
    // Initial condition: Product has exactly 5 units in stock
    const initialStock = 5;
    expect(productLimitedStock.stock_quantity).toBe(initialStock);

    // 1. Terminal A operates offline:
    // Starts with local stock = 5, sells 4 units
    const movementTerminalA: InventoryMovement = {
      id: 'mov-term-A-01',
      idempotency_key: 'idem-inv-termA-sale1',
      product_id: productLimitedStock.id,
      register_id: 'terminal-A',
      type: 'SALE',
      quantity_delta: -4, // Sold 4 units
      previous_quantity: 5,
      new_quantity: 1, // Terminal A thinks 1 remains locally
      user_id: 'cashier-A',
      notes: 'Terminal A offline sale of 4 units',
      timestamp: '2026-09-19T10:00:00.000Z',
      sync_status: 'synced',
    };

    // 2. Terminal B operates offline simultaneously:
    // Starts with local stock = 5, sells 4 units
    const movementTerminalB: InventoryMovement = {
      id: 'mov-term-B-01',
      idempotency_key: 'idem-inv-termB-sale1',
      product_id: productLimitedStock.id,
      register_id: 'terminal-B',
      type: 'SALE',
      quantity_delta: -4, // Sold 4 units
      previous_quantity: 5,
      new_quantity: 1, // Terminal B thinks 1 remains locally
      user_id: 'cashier-B',
      notes: 'Terminal B offline sale of 4 units',
      timestamp: '2026-09-19T10:05:00.000Z',
      sync_status: 'synced',
    };

    // 3. Central Reconciler receives both movement deltas:
    // Terminal A: -4
    // Terminal B: -4
    const reconciliation = reconciler.reconcileProductMovements(
      productLimitedStock,
      initialStock,
      [movementTerminalA, movementTerminalB]
    );

    // Expected Business Rule Verifications:
    // Actual stock = 5 + (-4) + (-4) = -3
    expect(reconciliation.initialStock).toBe(5);
    expect(reconciliation.totalDelta).toBe(-8);
    expect(reconciliation.reconciledStock).toBe(-3);

    // The system MUST detect this rather than silently claiming everything is correct!
    expect(reconciliation.hasConflict).toBe(true);
    expect(reconciliation.conflict).toBeDefined();

    const conflict = reconciliation.conflict!;
    expect(conflict.deficit_quantity).toBe(3); // 3 units oversold!
    expect(conflict.reconciled_stock).toBe(-3);
    expect(conflict.initial_stock).toBe(5);
    expect(conflict.total_sold).toBe(8);
    expect(conflict.status).toBe('detected');
    expect(conflict.contributing_registers).toContain('terminal-A');
    expect(conflict.contributing_registers).toContain('terminal-B');
    expect(conflict.resolution_strategy).toBe('ALLOW_NEGATIVE_AND_ALERT');
    expect(conflict.resolution_notes).toContain('Oversell conflict detected');

    // 4. Apply the reconciliation to the system of record
    await reconciler.applyReconciliation(reconciliation, testDb);

    // Verify DB reflects true physical state (-3) instead of false optimism
    const productAfterReconciliation = await testDb.products.get(productLimitedStock.id);
    expect(productAfterReconciliation?.stock_quantity).toBe(-3);

    // Verify audit log has recorded the conflict alert for management
    const auditLogs = await testDb.auditLogs.toArray();
    const conflictLog = auditLogs.find(a => a.action === 'INVENTORY_OVERSELL_CONFLICT');
    expect(conflictLog).toBeDefined();
    expect(conflictLog?.details).toContain('Oversell conflict detected');
    expect(conflictLog?.details).toContain('terminal-A, terminal-B');

    // 5. Compare with naive stock_quantity synchronization to prove why movements are essential
    const comparison = reconciler.compareWithNaiveSync(initialStock, [
      { registerId: 'terminal-A', soldQty: 4 },
      { registerId: 'terminal-B', soldQty: 4 },
    ]);

    // Naive sync would claim stock is 1 and fail to detect the deficit
    expect(comparison.naiveStockSync.lastWriteWinsStock).toBe(1);
    expect(comparison.naiveStockSync.detectedDeficit).toBe(false);
    expect(comparison.naiveStockSync.salesLostCount).toBe(4); // Lost 4 units of sales!

    // Delta reconciliation correctly calculates true stock -3 and flags deficit
    expect(comparison.deltaReconciliation.trueStock).toBe(-3);
    expect(comparison.deltaReconciliation.deficitUnits).toBe(3);
    expect(comparison.deltaReconciliation.detectedDeficit).toBe(true);
  });
});
