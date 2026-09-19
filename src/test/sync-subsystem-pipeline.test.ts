import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PosDatabase } from '../db/database';
import { SyncEngine } from '../sync/syncEngine';
import { SyncQueue } from '../sync/syncQueue';
import { ConflictResolver } from '../sync/conflictResolver';
import { RetryManager } from '../sync/retryManager';
import { connectivityService } from '../services/connectivity';
import { SalesRepository } from '../db/repositories/salesRepository';
import { Shift, Product, Register, Customer } from '../types';
import { SyncTelemetry } from '../sync/types';

describe('Authoritative Offline to Supabase Sync Subsystem Pipeline Test', () => {
  let testDb: PosDatabase;
  let testQueue: SyncQueue;
  let testResolver: ConflictResolver;
  let testRetrier: RetryManager;
  let testEngine: SyncEngine;
  let salesRepo: SalesRepository;

  let testRegister: Register;
  let testShift: Shift;
  let testProduct: Product;
  let testCustomer: Customer;

  beforeEach(async () => {
    const dbName = `test-pos-sync-pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDb = new PosDatabase(dbName);
    testQueue = new SyncQueue(testDb);
    testResolver = new ConflictResolver();
    testRetrier = new RetryManager({ baseDelayMs: 5000, maxDelayMs: 30000 });
    testEngine = new SyncEngine(testDb, testQueue, testResolver, testRetrier);
    salesRepo = new SalesRepository(testDb);

    testRegister = {
      id: 'reg-001-main',
      register_name: 'Register 01 (Main Counter)',
      branch_name: 'Kampala Flagship',
      is_active: true,
    };
    await testDb.registers.put(testRegister);

    testShift = {
      id: 'shift-pipe-01',
      idempotency_key: 'shift-pipe-idemp-01',
      register_id: testRegister.id,
      cashier_id: 'cashier-01',
      status: 'open',
      opened_at: new Date().toISOString(),
      opening_float: 50000,
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      sync_status: 'synced',
    };
    await testDb.shifts.put(testShift);

    testProduct = {
      id: 'prod-bread-01',
      sku: 'BREAD-001',
      barcode: '600987654321',
      name: 'Artisan Whole Wheat Bread',
      category_id: 'cat-bakery',
      cost_price: 2000,
      selling_price: 3000,
      tax_rate: 0,
      unit: 'loaf',
      stock_quantity: 50,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(testProduct);

    testCustomer = {
      id: 'cust-sarah-01',
      name: 'Sarah Connor',
      phone: '+256782334455',
      loyalty_points: 80,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.customers.put(testCustomer);

    connectivityService.setSimulatedOffline(false);
  });

  afterEach(() => {
    connectivityService.setSimulatedOffline(false);
    testEngine.destroy();
  });

  it('1. Offline Flow: Sale Created -> IndexedDB -> sync_queue -> "Offline — 7 transactions waiting to sync"', async () => {
    // Simulate device going offline
    connectivityService.setSimulatedOffline(true);

    const emittedStates: SyncTelemetry[] = [];
    testEngine.subscribeTelemetry(t => emittedStates.push(t));

    // Create 7 offline sales
    for (let i = 1; i <= 7; i++) {
      await salesRepo.createSaleTransaction({
        items: [
          {
            product: testProduct,
            quantity: 1,
            unit_price: 3000,
            tax_rate: 0,
            discount_amount: 0,
            item_total: 3000,
          },
        ],
        payments: [{ id: `p-${i}`, method: 'cash', amount_paid: 3000 }],
        shift: testShift,
        registerId: testRegister.id,
        cashierId: 'cashier-01',
      });
    }

    // Verify all 7 sales are stored in IndexedDB with sync_status = 'pending'
    const pendingSales = await testDb.sales.where('sync_status').equals('pending').toArray();
    expect(pendingSales.length).toBe(7);

    // Verify sync_queue contains the pending sales
    const queueItems = await testDb.syncQueue.where('entity_type').equals('sale').toArray();
    expect(queueItems.length).toBe(7);

    // Refresh telemetry
    await testEngine.emitTelemetry();
    const latestTelemetry = emittedStates[emittedStates.length - 1];

    expect(latestTelemetry.stage).toBe('offline_pending');
    expect(latestTelemetry.pendingCount).toBeGreaterThanOrEqual(7);
    // Matches exact user message requirement:
    expect(latestTelemetry.statusMessage).toMatch(/Offline — \d+ transactions waiting to sync/);
    expect(latestTelemetry.statusMessage).toContain('Offline — 7 transactions waiting to sync');
  });

  it('2. Online Restoration: Validate -> Send -> Idempotency -> Commit -> "Syncing 7 transactions…" -> "All transactions synchronized"', async () => {
    // 1. Prepare 7 offline transactions
    connectivityService.setSimulatedOffline(true);
    for (let i = 1; i <= 7; i++) {
      await salesRepo.createSaleTransaction({
        items: [
          {
            product: testProduct,
            quantity: 1,
            unit_price: 3000,
            tax_rate: 0,
            discount_amount: 0,
            item_total: 3000,
          },
        ],
        payments: [{ id: `p-${i}`, method: 'cash', amount_paid: 3000 }],
        shift: testShift,
        registerId: testRegister.id,
        cashierId: 'cashier-01',
      });
    }

    // Track state transitions
    const recordedMessages: string[] = [];
    const recordedStages: string[] = [];

    testEngine.subscribeTelemetry(t => {
      recordedMessages.push(t.statusMessage);
      recordedStages.push(t.stage);
    });

    // 2. Internet becomes available
    connectivityService.setSimulatedOffline(false);

    // 3. Process queue
    const result = await testEngine.processQueue();
    expect(result.processed).toBeGreaterThanOrEqual(7);
    expect(result.errors).toBe(0);

    // 4. Verify telemetry saw "Syncing..." and transitioned to "All transactions synchronized"
    const sawSyncing = recordedMessages.some(m => m.includes('Syncing'));
    const sawSynchronized = recordedMessages.some(m => m === 'All transactions synchronized');

    expect(sawSyncing).toBe(true);
    expect(sawSynchronized).toBe(true);

    // 5. Verify local records are marked SYNCHRONIZED in IndexedDB
    const allSales = await testDb.sales.toArray();
    expect(allSales.length).toBe(7);
    for (const s of allSales) {
      expect(s.sync_status).toBe('synced');
      expect(s.server_synced_at).toBeDefined();
    }

    // 6. Verify audit log contains SYNC_SUCCESS
    const syncAuditLogs = await testDb.auditLogs.where('action').equals('SYNC_SUCCESS').toArray();
    expect(syncAuditLogs.length).toBeGreaterThanOrEqual(7);
  });

  it('3. Failure Flow: SYNC FAILED -> retry_count + 1 -> wait -> retry', async () => {
    // Insert a malformed item into sync_queue that fails validation
    await testQueue.enqueue({
      entityType: 'sale',
      entityId: 'sale-broken-01',
      operation: 'INSERT',
      payload: JSON.stringify({ malformed: true }), // missing required sale.id and sale.receipt_number
      idempotencyKey: 'broken-key-01',
      maxAttempts: 3,
    });

    const recordedStages: string[] = [];
    testEngine.subscribeTelemetry(t => recordedStages.push(t.stage));

    // Process
    const result = await testEngine.processQueue();
    expect(result.errors).toBe(1);

    // Verify retry loop was triggered
    const failedItem = await testDb.syncQueue.where('idempotency_key').equals('broken-key-01').first();
    expect(failedItem?.attempts).toBe(1);

    // Verify telemetry shows failure & retry countdown
    await testEngine.emitTelemetry();
    expect(recordedStages).toContain('sync_failed');

    // Test immediate retryNow()
    const retryResult = await testEngine.retryNow();
    expect(retryResult.errors).toBe(1);

    const retriedAgainItem = await testDb.syncQueue.where('idempotency_key').equals('broken-key-01').first();
    expect(retriedAgainItem?.attempts).toBe(2);
  });

  it('4. Idempotency deduplication: commits duplicate key gracefully without failing', async () => {
    const saleResult = await salesRepo.createSaleTransaction({
      items: [
        {
          product: testProduct,
          quantity: 1,
          unit_price: 3000,
          tax_rate: 0,
          discount_amount: 0,
          item_total: 3000,
        },
      ],
      payments: [{ id: 'p-idem', method: 'cash', amount_paid: 3000 }],
      shift: testShift,
      registerId: testRegister.id,
      cashierId: 'cashier-01',
    });

    // Enqueue a duplicate item with the exact same idempotency_key
    await testQueue.enqueue({
      entityType: 'sale',
      entityId: saleResult.sale.id,
      operation: 'INSERT',
      payload: JSON.stringify({
        sale: saleResult.sale,
        items: saleResult.items,
        payments: saleResult.payments,
      }),
      idempotencyKey: saleResult.sale.idempotency_key,
    });

    // Execute sync
    const res = await testEngine.processQueue();
    expect(res.errors).toBe(0);

    const duplicateQueueItem = await testDb.syncQueue
      .where('idempotency_key')
      .equals(saleResult.sale.idempotency_key)
      .last();

    expect(duplicateQueueItem?.status).toBe('synced');
  });
});
