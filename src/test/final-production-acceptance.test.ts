import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PosDatabase } from '../db/database';
import { SalesRepository } from '../db/repositories/salesRepository';
import { ShiftRepository } from '../db/repositories/shiftRepository';
import { ProductRepository } from '../db/repositories/productRepository';
import { CustomerRepository } from '../db/repositories/customerRepository';
import { SyncQueue } from '../sync/syncQueue';
import { SyncEngine } from '../sync/syncEngine';
import { ConflictResolver } from '../sync/conflictResolver';
import { RetryManager } from '../sync/retryManager';
import { connectivityService } from '../services/connectivity';
import { posStore } from '../store/posStore';
import { calculateCartTotals } from '../utils/money';
import { generateUUID } from '../utils/id';
import {
  Register,
  Product,
  User,
  Shift,
  Customer,
  CartItem,
  PaymentBreakdown,
  SyncTelemetry,
} from '../types';

describe('Final Production Acceptance Test Suite: Complete 18-Step POS Flow (Online & Offline)', () => {
  let testDb: PosDatabase;
  let salesRepo: SalesRepository;
  let shiftRepo: ShiftRepository;
  let productRepo: ProductRepository;
  let customerRepo: CustomerRepository;
  let syncQueue: SyncQueue;
  let syncEngine: SyncEngine;
  let retryManager: RetryManager;
  let conflictResolver: ConflictResolver;

  let register: Register;
  let cashier: User;
  let productRice: Product;
  let productBread: Product;
  let productOutOfStock: Product;
  let customerSarah: Customer;

  beforeEach(async () => {
    const dbName = `acceptance-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDb = new PosDatabase(dbName);
    await testDb.open();

    salesRepo = new SalesRepository(testDb);
    shiftRepo = new ShiftRepository(testDb);
    productRepo = new ProductRepository(testDb);
    customerRepo = new CustomerRepository(testDb);
    syncQueue = new SyncQueue(testDb);
    retryManager = new RetryManager();
    conflictResolver = new ConflictResolver();
    syncEngine = new SyncEngine(testDb, syncQueue, conflictResolver, retryManager);

    // Reset online state
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');

    // Seed Master Data
    register = {
      id: 'reg-acceptance-01',
      register_name: 'Counter Terminal 1',
      branch_name: 'Kampala Central Flagship',
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

    productRice = {
      id: 'prod-rice-01',
      sku: 'GRO-001',
      barcode: '600100100100',
      name: 'Basmati Rice 5kg',
      category_id: 'cat-grocery',
      selling_price: 35000,
      cost_price: 28000,
      stock_quantity: 50,
      min_stock_level: 10,
      unit: 'pack',
      tax_rate: 0,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(productRice);

    productBread = {
      id: 'prod-bread-01',
      sku: 'BAK-001',
      barcode: '600200200200',
      name: 'Whole Wheat Bread 800g',
      category_id: 'cat-bakery',
      selling_price: 6500,
      cost_price: 4500,
      stock_quantity: 30,
      min_stock_level: 5,
      unit: 'loaf',
      tax_rate: 0, // Zero-rated
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(productBread);

    productOutOfStock = {
      id: 'prod-oos-01',
      sku: 'OOS-001',
      barcode: '600999999999',
      name: 'Limited Artisanal Cheese',
      category_id: 'cat-dairy',
      selling_price: 15000,
      cost_price: 10000,
      stock_quantity: 0, // Out of stock
      min_stock_level: 5,
      unit: 'piece',
      tax_rate: 0.18,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(productOutOfStock);

    customerSarah = {
      id: 'cust-sarah-01',
      name: 'Sarah Kigozi',
      phone: '+256701234567',
      email: 'sarah.k@example.com',
      loyalty_number: 'LOYAL-7788',
      loyalty_points: 150,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.customers.put(customerSarah);

    posStore.logout();
  });

  afterEach(async () => {
    syncEngine.destroy();
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');
    if (testDb.isOpen()) {
      await testDb.close();
    }
  });

  // ===========================================================================
  // SECTION 1: ONLINE 18-STEP POS WORKFLOW
  // ===========================================================================
  it('Phase 1: strictly verifies complete 18-Step POS workflow online from login to shift close', async () => {
    expect(connectivityService.isOnline()).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 1: LOGIN
    // -------------------------------------------------------------------------
    const authenticatedUser = await testDb.users.get(cashier.id);
    expect(authenticatedUser).toBeDefined();
    expect(authenticatedUser?.role).toBe('cashier');

    posStore.setState({
      currentUser: authenticatedUser!,
      activeRegister: register,
      activeWorkflowStep: 1,
    });
    expect(posStore.getState().currentUser?.name).toBe('Robert Cashier');
    expect(posStore.getState().activeWorkflowStep).toBe(1);

    // -------------------------------------------------------------------------
    // STEP 2: OPEN SHIFT
    // -------------------------------------------------------------------------
    const openingFloat = 50000; // UGX 50,000 float
    const shiftId = generateUUID();
    const openShiftRecord: Shift = {
      id: shiftId,
      idempotency_key: `shift-open-${shiftId}`,
      register_id: register.id,
      cashier_id: cashier.id,
      status: 'open',
      opened_at: new Date().toISOString(),
      opening_float: openingFloat,
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      notes: 'Final acceptance online shift opened',
      sync_status: 'pending',
    };
    await testDb.shifts.put(openShiftRecord);

    posStore.setState({
      activeShift: openShiftRecord,
      activeWorkflowStep: 2,
    });
    expect(posStore.getState().activeShift?.status).toBe('open');
    expect(posStore.getState().activeShift?.opening_float).toBe(50000);

    // -------------------------------------------------------------------------
    // STEP 3: DASHBOARD
    // -------------------------------------------------------------------------
    posStore.setState({ activeWorkflowStep: 3, activeView: 'dashboard' });
    expect(posStore.getState().activeWorkflowStep).toBe(3);
    expect(posStore.getState().activeView).toBe('dashboard');

    // -------------------------------------------------------------------------
    // STEP 4: NEW SALE
    // -------------------------------------------------------------------------
    posStore.startNewSale();
    expect(posStore.getState().activeWorkflowStep).toBe(4);
    expect(posStore.getState().cartItems).toHaveLength(0);
    expect(posStore.getState().selectedCustomer).toBeNull();
    expect(posStore.getState().currentSaleId).toBeDefined();

    // -------------------------------------------------------------------------
    // STEP 5: SCAN / SEARCH PRODUCT & DECISION GATE (Product Found?)
    // -------------------------------------------------------------------------
    // Subtest: Unrecognized barcode triggers Not Found modal
    const invalidBarcode = '999999999999';
    const notFoundResult = await productRepo.getByBarcode(invalidBarcode);
    expect(notFoundResult).toBeUndefined();
    posStore.setState({ isProductNotFoundOpen: true, searchedNotFoundTerm: invalidBarcode });
    expect(posStore.getState().isProductNotFoundOpen).toBe(true);
    posStore.setState({ isProductNotFoundOpen: false, searchedNotFoundTerm: '' });

    // Subtest: Product Found -> Basmati Rice & Bread
    const foundRice = await productRepo.getByBarcode(productRice.barcode);
    expect(foundRice).toBeDefined();
    expect(foundRice?.name).toBe('Basmati Rice 5kg');
    posStore.setState({ activeWorkflowStep: 5 });

    // -------------------------------------------------------------------------
    // STEP 6: CHECK STOCK & DECISION GATE (In Stock?)
    // -------------------------------------------------------------------------
    // Subtest: Zero stock product is rejected
    const canAddOos = posStore.addToCart(productOutOfStock, 1);
    expect(canAddOos).toBe(false);
    expect(posStore.getState().isStockAlertOpen).toBe(true);
    posStore.setState({ isStockAlertOpen: false });

    // Subtest: Positive stock item passes gate
    expect(foundRice!.stock_quantity).toBe(50);
    posStore.setState({ activeWorkflowStep: 6 });

    // -------------------------------------------------------------------------
    // STEP 7: ADD TO CART & DECISION GATE (More Products?)
    // -------------------------------------------------------------------------
    const addedRice = posStore.addToCart(foundRice!, 2); // 2 x 35,000 = 70,000
    expect(addedRice).toBe(true);
    expect(posStore.getState().cartItems).toHaveLength(1);

    // More Products? -> YES -> Scan Whole Wheat Bread
    const foundBread = await productRepo.getBySku(productBread.sku);
    expect(foundBread).toBeDefined();
    const addedBread = posStore.addToCart(foundBread!, 1); // 1 x 6,500 = 6,500
    expect(addedBread).toBe(true);
    expect(posStore.getState().cartItems).toHaveLength(2);

    // More Products? -> NO -> Proceed to Review Cart
    posStore.proceedToReviewCart();
    expect(posStore.getState().activeWorkflowStep).toBe(8);

    // -------------------------------------------------------------------------
    // STEP 8: REVIEW CART
    // -------------------------------------------------------------------------
    // Update line-item notes & apply 10% discount
    posStore.updateCartItemMeta(productBread.id, 0, 'Customer requested unsliced');
    posStore.setCartDiscount(10, 0); // 10% discount

    const totals = calculateCartTotals(
      posStore.getState().cartItems,
      posStore.getState().cartDiscountPercent,
      posStore.getState().cartDiscountFixed
    );
    expect(totals.subtotal).toBe(76500); // 70000 + 6500
    expect(totals.totalDiscount).toBe(7650); // 10% of 76500
    expect(totals.grandTotal).toBe(68850); // 76500 - 7650

    // -------------------------------------------------------------------------
    // STEP 9: CUSTOMER SELECTION & LOYALTY LOOKUP
    // -------------------------------------------------------------------------
    posStore.proceedToCustomer();
    expect(posStore.getState().activeWorkflowStep).toBe(9);

    posStore.selectCustomer(customerSarah);
    expect(posStore.getState().selectedCustomer?.name).toBe('Sarah Kigozi');
    expect(posStore.getState().selectedCustomer?.loyalty_points).toBe(150);

    // -------------------------------------------------------------------------
    // STEP 10: PAYMENT
    // -------------------------------------------------------------------------
    posStore.proceedToPayment();
    expect(posStore.getState().activeWorkflowStep).toBe(10);
    expect(posStore.getState().isPaymentModalOpen).toBe(true);

    const grandTotal = totals.grandTotal; // 68850
    const cashTendered = 30000;
    const cardTendered = 38850;

    const payments: PaymentBreakdown[] = [
      { id: 'pay-cash-01', method: 'cash', amount_paid: cashTendered },
      { id: 'pay-card-01', method: 'card', amount_paid: cardTendered, reference: 'AUTH-VISA-9911' },
    ];

    // -------------------------------------------------------------------------
    // STEP 11: PAYMENT SUCCESSFUL (Decision Gate)
    // -------------------------------------------------------------------------
    // Subtest: Underpayment rejection
    await expect(
      salesRepo.createSaleTransaction({
        items: posStore.getState().cartItems,
        cartDiscountPercent: 10,
        payments: [{ id: 'fail-p', method: 'cash', amount_paid: 10000 }],
        customer: customerSarah,
        shift: openShiftRecord,
        registerId: register.id,
        cashierId: cashier.id,
      })
    ).rejects.toThrow(/Insufficient payment/);

    // Subtest: Full payment execution
    const saleResult = await salesRepo.createSaleTransaction({
      items: posStore.getState().cartItems,
      cartDiscountPercent: 10,
      payments,
      customer: customerSarah,
      shift: openShiftRecord,
      registerId: register.id,
      cashierId: cashier.id,
      notes: 'Online 18-step acceptance test',
    });

    expect(saleResult.sale.payment_status).toBe('paid');
    expect(saleResult.sale.total_amount).toBe(grandTotal);
    expect(saleResult.payments).toHaveLength(2);

    posStore.proceedToReceipt(saleResult);
    expect(posStore.getState().activeWorkflowStep).toBe(12);

    // -------------------------------------------------------------------------
    // STEP 12: RECEIPT
    // -------------------------------------------------------------------------
    expect(saleResult.receipt).toBeDefined();
    expect(saleResult.receipt.receipt_number).toMatch(/^CR-(\d{2}-)?\d{8}-\d{6}$/);
    const receiptInDb = await testDb.receipts.get(saleResult.receipt.id);
    expect(receiptInDb).toBeDefined();
    const receiptContent = JSON.parse(receiptInDb!.content_json);
    expect(receiptContent.sale.total_amount).toBe(grandTotal);

    // -------------------------------------------------------------------------
    // STEP 13: INVENTORY UPDATE
    // -------------------------------------------------------------------------
    const updatedRice = await testDb.products.get(productRice.id);
    const updatedBread = await testDb.products.get(productBread.id);
    expect(updatedRice?.stock_quantity).toBe(48); // 50 - 2
    expect(updatedBread?.stock_quantity).toBe(29); // 30 - 1

    const movements = await testDb.inventoryMovements
      .where('reference_id')
      .equals(saleResult.sale.id)
      .toArray();
    expect(movements).toHaveLength(2);
    const riceMovement = movements.find(m => m.product_id === productRice.id);
    expect(riceMovement?.quantity_delta).toBe(-2);
    expect(riceMovement?.type).toBe('SALE');

    // -------------------------------------------------------------------------
    // STEP 14: SALES REPORT UPDATE
    // -------------------------------------------------------------------------
    const updatedShift = await testDb.shifts.get(shiftId);
    expect(updatedShift).toBeDefined();
    expect(updatedShift?.transaction_count).toBe(1);
    expect(updatedShift?.total_sales).toBe(grandTotal);
    expect(updatedShift?.cash_sales_total).toBe(cashTendered);
    expect(updatedShift?.card_sales_total).toBe(cardTendered);

    // -------------------------------------------------------------------------
    // STEP 15: LOYALTY POINTS (Audit Trail Ledger)
    // -------------------------------------------------------------------------
    const updatedCust = await testDb.customers.get(customerSarah.id);
    expect(updatedCust).toBeDefined();
    expect(updatedCust!.loyalty_points).toBeGreaterThan(150);

    const loyaltyTx = await testDb.loyaltyTransactions
      .where('sale_id')
      .equals(saleResult.sale.id)
      .first();
    expect(loyaltyTx).toBeDefined();
    expect(loyaltyTx?.points_delta).toBeGreaterThan(0);
    expect(loyaltyTx?.reason).toContain(saleResult.sale.receipt_number);

    // -------------------------------------------------------------------------
    // STEP 16: SALE COMPLETED
    // -------------------------------------------------------------------------
    posStore.proceedToSaleCompleted();
    expect(posStore.getState().activeWorkflowStep).toBe(16);
    expect(posStore.getState().lastCompletedSaleResult?.sale.id).toBe(saleResult.sale.id);

    // -------------------------------------------------------------------------
    // STEP 17: NEXT CUSTOMER
    // -------------------------------------------------------------------------
    posStore.proceedToNextCustomer();
    expect(posStore.getState().activeWorkflowStep).toBe(4);
    expect(posStore.getState().cartItems).toHaveLength(0);
    expect(posStore.getState().selectedCustomer).toBeNull();
    expect(posStore.getState().currentSaleId).not.toBe(saleResult.sale.id);

    // -------------------------------------------------------------------------
    // STEP 18: CLOSE SHIFT & RECONCILIATION
    // -------------------------------------------------------------------------
    posStore.openCloseShiftModal();
    expect(posStore.getState().activeWorkflowStep).toBe(18);

    const expectedCashInDrawer = openingFloat + updatedShift!.cash_sales_total; // 50,000 + 30,000 = 80,000
    const actualCountedCash = 80000;
    const variance = actualCountedCash - expectedCashInDrawer;
    expect(variance).toBe(0); // Perfectly balanced

    const closeResult = await shiftRepo.closeShift({
      shiftId,
      cashierId: cashier.id,
      closingCashActual: actualCountedCash,
      notes: 'End of online acceptance shift: balanced drawer verified',
    });

    expect(closeResult.status).toBe('closed');
    expect(closeResult.closing_cash_actual).toBe(80000);
    expect(closeResult.closing_cash_expected).toBe(80000);
    expect(closeResult.variance).toBe(0);

    posStore.logout();
    expect(posStore.getState().currentUser).toBeNull();
    expect(posStore.getState().activeWorkflowStep).toBe(1);
  });

  // ===========================================================================
  // SECTION 2: 100% DISCONNECTED OFFLINE 18-STEP WORKFLOW
  // ===========================================================================
  it('Phase 2: strictly executes the complete 18-Step POS flow with internet completely DISCONNECTED', async () => {
    // DISCONNECT INTERNET
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');
    expect(connectivityService.isOnline()).toBe(false);

    // 1. Offline Login
    const offlineCashier = await testDb.users.get(cashier.id);
    expect(offlineCashier).toBeDefined();
    posStore.setState({
      currentUser: offlineCashier!,
      activeRegister: register,
      activeWorkflowStep: 1,
    });

    // 2. Open Shift Offline
    const offlineShiftId = generateUUID();
    const offlineShift: Shift = {
      id: offlineShiftId,
      idempotency_key: `shift-offline-${offlineShiftId}`,
      register_id: register.id,
      cashier_id: cashier.id,
      status: 'open',
      opened_at: new Date().toISOString(),
      opening_float: 100000, // 100,000 UGX float
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      notes: 'Completely offline shift',
      sync_status: 'pending',
    };
    await testDb.shifts.put(offlineShift);
    posStore.setState({ activeShift: offlineShift, activeWorkflowStep: 2 });

    // 3. Dashboard Offline
    posStore.setState({ activeWorkflowStep: 3, activeView: 'dashboard' });
    expect(posStore.getState().activeShift?.id).toBe(offlineShiftId);

    // 4. New Sale Offline
    posStore.startNewSale();
    expect(posStore.getState().cartItems).toHaveLength(0);

    // 5. Scan/Search Product Offline from local IndexedDB
    const localProductRice = await productRepo.getByBarcode(productRice.barcode);
    expect(localProductRice).toBeDefined();
    expect(localProductRice?.stock_quantity).toBe(50);

    // 6. Stock Gate Offline
    expect(localProductRice!.stock_quantity).toBeGreaterThan(0);

    // 7. Add to Cart Offline
    posStore.addToCart(localProductRice!, 3); // 3 x 35,000 = 105,000
    expect(posStore.getState().cartItems).toHaveLength(1);

    // 8. Review Cart Offline
    posStore.proceedToReviewCart();
    posStore.setCartDiscount(5, 0); // 5% discount

    const offlineTotals = calculateCartTotals(
      posStore.getState().cartItems,
      posStore.getState().cartDiscountPercent,
      posStore.getState().cartDiscountFixed
    );
    expect(offlineTotals.subtotal).toBe(105000);
    expect(offlineTotals.totalDiscount).toBe(5250); // 5% of 105,000
    expect(offlineTotals.grandTotal).toBe(99750); // 105,000 - 5250

    // 9. Customer Offline: Create new offline customer
    const offlineCust = await customerRepo.createCustomer({
      name: 'Offline Loyalty Member',
      phone: '+256788990011',
      email: 'offline.member@example.com',
      loyalty_number: 'LOYAL-OFF-01',
      loyalty_points: 200,
      sync_status: 'pending',
    });
    posStore.selectCustomer(offlineCust);

    // 10. Payment Offline: Cash payment
    posStore.proceedToPayment();
    const offlinePayment: PaymentBreakdown[] = [
      { id: 'p-off-cash', method: 'cash', amount_paid: 100000 }, // 100,000 cash (with 250 change)
    ];

    // 11. Payment Successful (Committed locally to IndexedDB with zero HTTP)
    const offlineSaleResult = await salesRepo.createSaleTransaction({
      items: posStore.getState().cartItems,
      cartDiscountPercent: 5,
      payments: offlinePayment,
      customer: offlineCust,
      shift: offlineShift,
      registerId: register.id,
      cashierId: cashier.id,
      notes: '100% offline completed sale',
    });

    expect(offlineSaleResult.sale.sync_status).toBe('pending');
    expect(offlineSaleResult.sale.total_amount).toBe(99750);
    expect(offlineSaleResult.sale.change_amount).toBe(250);

    // 12. Receipt Available Offline
    expect(offlineSaleResult.receipt).toBeDefined();
    expect(offlineSaleResult.receipt.sync_status).toBe('pending');
    const localReceipt = await testDb.receipts.get(offlineSaleResult.receipt.id);
    expect(localReceipt).toBeDefined();

    // 13. Inventory Update Offline
    const decrementedRice = await testDb.products.get(productRice.id);
    expect(decrementedRice?.stock_quantity).toBe(47); // 50 - 3

    // 14. Sales Report Update Offline
    const updatedOfflineShift = await testDb.shifts.get(offlineShiftId);
    expect(updatedOfflineShift?.total_sales).toBe(99750);
    expect(updatedOfflineShift?.transaction_count).toBe(1);

    // 15. Loyalty Points Offline (+50 points)
    const localUpdatedCust = await testDb.customers.get(offlineCust.id);
    expect(localUpdatedCust?.loyalty_points).toBeGreaterThan(200);

    // 16. Sale Completed Offline
    posStore.proceedToReceipt(offlineSaleResult);
    posStore.proceedToSaleCompleted();
    expect(posStore.getState().activeWorkflowStep).toBe(16);

    // 17. Next Customer Ready Offline
    posStore.proceedToNextCustomer();
    expect(posStore.getState().cartItems).toHaveLength(0);

    // 18. Close Shift Offline
    const expectedDrawer = 100000 + 99750; // 199,750 UGX
    const closedOfflineShift = await shiftRepo.closeShift({
      shiftId: offlineShiftId,
      cashierId: cashier.id,
      closingCashActual: expectedDrawer,
      notes: 'Shift closed offline with zero variance',
    });
    expect(closedOfflineShift.status).toBe('closed');
    expect(closedOfflineShift.variance).toBe(0);
    expect(closedOfflineShift.sync_status).toBe('pending');

    // Verify all offline items are in sync queue ready for internet return
    const queuedItems = await testDb.syncQueue.where('status').equals('pending').toArray();
    expect(queuedItems.length).toBeGreaterThanOrEqual(4); // sale, receipt, inventory_movement, customer, shift
  });

  // ===========================================================================
  // SECTION 3: INTERNET RECONNECTION & BIDIRECTIONAL SYNCHRONIZATION
  // ===========================================================================
  it('Phase 3: verifies safe reconnection synchronization, zero duplicates, inventory movements, and report reconciliation', async () => {
    // 1. Create multiple offline sales while internet is OFF
    connectivityService.setSimulatedOffline(true);
    connectivityService.setStatus('offline');

    const multiShiftId = generateUUID();
    const multiShift: Shift = {
      id: multiShiftId,
      idempotency_key: `shift-multi-${multiShiftId}`,
      register_id: register.id,
      cashier_id: cashier.id,
      status: 'open',
      opened_at: new Date().toISOString(),
      opening_float: 50000,
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      notes: 'Multi offline shift',
      sync_status: 'pending',
    };
    await testDb.shifts.put(multiShift);

    const offlineSalesCount = 5;
    const saleIds: string[] = [];
    const initialRiceStock = (await testDb.products.get(productRice.id))!.stock_quantity; // 50

    const singleCartItem: CartItem = {
      product: productRice,
      quantity: 1,
      unit_price: productRice.selling_price,
      discount_amount: 0,
      tax_rate: productRice.tax_rate,
      item_total: productRice.selling_price,
    };
    const cartTotals = calculateCartTotals([singleCartItem]);

    for (let i = 1; i <= offlineSalesCount; i++) {
      const res = await salesRepo.createSaleTransaction({
        items: [singleCartItem],
        payments: [
          { id: `p-sync-${i}`, method: 'cash', amount_paid: cartTotals.grandTotal },
        ],
        customer: customerSarah,
        shift: multiShift,
        registerId: register.id,
        cashierId: cashier.id,
        notes: `Offline Batch Sale #${i}`,
      });
      saleIds.push(res.sale.id);
    }

    // Check all sales are stored locally as 'pending'
    const pendingSales = await testDb.sales.where('sync_status').equals('pending').toArray();
    expect(pendingSales.length).toBe(offlineSalesCount);

    // Verify local stock decremented correctly: 50 - 5 = 45
    const stockAfterOfflineSales = (await testDb.products.get(productRice.id))!.stock_quantity;
    expect(stockAfterOfflineSales).toBe(initialRiceStock - offlineSalesCount);

    // 2. RECONNECT INTERNET
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');
    expect(connectivityService.isOnline()).toBe(true);

    // 3. EXECUTE SYNCHRONIZATION PIPELINE
    const syncTelemetryEvents: SyncTelemetry[] = [];
    syncEngine.subscribeTelemetry(t => syncTelemetryEvents.push(t));

    const syncResult = await syncEngine.processQueue();
    expect(syncResult.processed).toBeGreaterThanOrEqual(offlineSalesCount);
    expect(syncResult.errors).toBe(0);

    // 4. VERIFY: All offline sales are now synchronized
    const remainingPendingSales = await testDb.sales.where('sync_status').equals('pending').count();
    expect(remainingPendingSales).toBe(0);

    for (const id of saleIds) {
      const syncedSale = await testDb.sales.get(id);
      expect(syncedSale?.sync_status).toBe('synced');
      expect(syncedSale?.server_synced_at).toBeDefined();
    }

    // 5. VERIFY: Zero duplicate sales created (Re-run sync to test idempotency)
    const secondSyncResult = await syncEngine.processQueue();
    expect(secondSyncResult.processed).toBe(0);
    expect(secondSyncResult.errors).toBe(0);

    const totalSalesAfterSync = await testDb.sales.count();
    expect(totalSalesAfterSync).toBe(offlineSalesCount);

    // 6. VERIFY: Inventory movements synchronize without duplicate deductions
    const movements = await testDb.inventoryMovements.toArray();
    expect(movements.length).toBe(offlineSalesCount);
    for (const mov of movements) {
      expect(mov.sync_status).toBe('synced');
      expect(mov.quantity_delta).toBe(-1);
    }

    // Product stock must still be exactly 45 (not double decremented to 40)
    const stockAfterSync = (await testDb.products.get(productRice.id))!.stock_quantity;
    expect(stockAfterSync).toBe(initialRiceStock - offlineSalesCount);

    // 7. VERIFY: Customers & Loyalty Transactions synchronized
    const loyaltyTxs = await testDb.loyaltyTransactions.toArray();
    expect(loyaltyTxs.length).toBe(offlineSalesCount);
    for (const tx of loyaltyTxs) {
      expect(tx.sync_status).toBe('synced');
      expect(tx.points_delta).toBeGreaterThan(0);
    }

    // 8. VERIFY: Receipts remain available and intact
    const receipts = await testDb.receipts.toArray();
    expect(receipts.length).toBe(offlineSalesCount);
    for (const rcpt of receipts) {
      expect(rcpt.sync_status).toBe('synced');
      const rcptContent = JSON.parse(rcpt.content_json);
      expect(rcptContent.sale.total_amount).toBe(cartTotals.grandTotal);
    }

    // 9. VERIFY: Shift information reconciles
    const finalShift = await testDb.shifts.get(multiShiftId);
    expect(finalShift?.transaction_count).toBe(offlineSalesCount);
    expect(finalShift?.total_sales).toBe(offlineSalesCount * cartTotals.grandTotal);
    expect(finalShift?.cash_sales_total).toBe(offlineSalesCount * cartTotals.grandTotal);

    // 10. VERIFY: Financial amounts never altered
    for (const saleId of saleIds) {
      const s = await testDb.sales.get(saleId);
      expect(s?.subtotal).toBe(cartTotals.subtotal);
      expect(s?.total_amount).toBe(cartTotals.grandTotal);
      expect(s?.tax_amount).toBeGreaterThanOrEqual(0);
    }
  });

  // ===========================================================================
  // SECTION 4: RESILIENCE & DEAD-LETTER SAFETY
  // ===========================================================================
  it('Phase 4: verifies safe retry backoff and dead-letter routing without silent transaction loss', async () => {
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');

    // Create item that intentionally causes permanent validation failure
    const malformedPayload = JSON.stringify({ sale: null }); // Missing sale object
    await testDb.syncQueue.add({
      idempotency_key: 'acceptance-malformed-01',
      entity_type: 'sale',
      entity_id: 'sale-invalid-999',
      operation: 'INSERT',
      payload: malformedPayload,
      status: 'pending',
      attempts: 5,
      max_attempts: 5,
      created_at: new Date().toISOString(),
    });

    // Execute sync
    await syncEngine.processQueue();

    // Check dead-letter error record created
    const deadLetters = await testDb.syncErrors.where('entity_id').equals('sale-invalid-999').toArray();
    expect(deadLetters.length).toBe(1);
    expect(deadLetters[0].idempotency_key).toBe('acceptance-malformed-01');

    // Item must be removed from active pending queue (status transitioned to 'failed')
    const pendingItem = await testDb.syncQueue
      .where('idempotency_key')
      .equals('acceptance-malformed-01')
      .and(i => i.status === 'pending')
      .first();
    expect(pendingItem).toBeUndefined();
  });
});
