import { describe, it, expect, beforeEach } from 'vitest';
import { PosDatabase } from '../db/database';
import { LoyaltyRepository } from '../db/repositories/loyaltyRepository';
import { LoyaltyService } from '../services/loyaltyService';
import { SalesRepository } from '../db/repositories/salesRepository';
import { ShiftRepository } from '../db/repositories/shiftRepository';
import { Customer, Product, Register, User } from '../types';

describe('Authoritative Loyalty Transaction Audit Trail Test', () => {
  let testDb: PosDatabase;
  let loyaltyRepo: LoyaltyRepository;
  let loyaltyService: LoyaltyService;
  let salesRepo: SalesRepository;
  let shiftRepo: ShiftRepository;

  let testCustomer: Customer;
  let testUser: User;
  let testRegister: Register;
  let testProduct: Product;

  beforeEach(async () => {
    const dbName = `test-loyalty-audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDb = new PosDatabase(dbName);
    await testDb.open();

    loyaltyRepo = new LoyaltyRepository(testDb);
    loyaltyService = new LoyaltyService(loyaltyRepo, testDb);
    salesRepo = new SalesRepository(testDb);
    shiftRepo = new ShiftRepository(testDb);

    testCustomer = {
      id: 'cust-loyalty-01',
      name: 'Alice Nansubuga',
      phone: '+256701112233',
      email: 'alice@example.com',
      loyalty_points: 0,
      total_spent: 0,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.customers.put(testCustomer);

    testUser = {
      id: 'user-cashier-99',
      username: 'sarah_c',
      full_name: 'Sarah Cashier',
      name: 'Sarah Cashier',
      role: 'cashier',
      pin_hash: '1234',
      salt: 'salt123',
      is_active: true,
    };
    await testDb.users.put(testUser);

    testRegister = {
      id: 'reg-front-01',
      register_name: 'Counter 1',
      branch_name: 'Kampala Flagship',
      is_active: true,
    };
    await testDb.registers.put(testRegister);

    testProduct = {
      id: 'prod-latte-01',
      sku: 'LATTE-01',
      barcode: '123456789012',
      category_id: 'cat-beverages',
      name: 'Vanilla Iced Latte',
      cost_price: 3000,
      selling_price: 8000,
      tax_rate: 0,
      unit: 'cup',
      stock_quantity: 50,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(testProduct);
  });

  it('records an authoritative LOYALTY TRANSACTION (+50 points, Sale #ABC123) with complete audit trail rather than raw mutation', async () => {
    // Exact requirement check:
    // LOYALTY TRANSACTION
    // +50 points
    // Sale #ABC123
    const receiptNumber = 'ABC123';
    const pointsDelta = 50;

    const result = await loyaltyService.recordEarn({
      customerId: testCustomer.id,
      pointsEarned: pointsDelta,
      saleId: 'sale-uuid-abc-123',
      receiptNumber: receiptNumber,
      cashierId: testUser.id,
    });

    const tx = result.transaction;
    expect(tx.customer_id).toBe(testCustomer.id);
    expect(tx.points_delta).toBe(50);
    expect(tx.receipt_number).toBe('ABC123');
    expect(tx.reason).toBe('Earned from Sale #ABC123');
    expect(tx.type).toBe('EARN');
    expect(tx.previous_points).toBe(0);
    expect(tx.new_points).toBe(50);
    expect(tx.cashier_id).toBe(testUser.id);
    expect(tx.idempotency_key).toBeDefined();

    // Verify Customer record is updated in lockstep
    const customerInDb = await testDb.customers.get(testCustomer.id);
    expect(customerInDb?.loyalty_points).toBe(50);

    // Verify Audit Log was recorded
    const auditLogs = await testDb.auditLogs.toArray();
    const loyaltyLog = auditLogs.find(a => a.entity_id === tx.id);
    expect(loyaltyLog).toBeDefined();
    expect(loyaltyLog?.action).toBe('LOYALTY_EARN');
    expect(loyaltyLog?.details).toContain('+50 points');
    expect(loyaltyLog?.details).toContain('Sale #ABC123');
    expect(loyaltyLog?.details).toContain('Previous: 0 -> New: 50');

    // Verify Sync Queue item was created
    const syncQueue = await testDb.syncQueue.toArray();
    const syncItem = syncQueue.find(s => s.entity_id === tx.id);
    expect(syncItem).toBeDefined();
    expect(syncItem?.entity_type).toBe('loyalty_transaction');
    expect(syncItem?.operation).toBe('INSERT');
  });

  it('records point redemptions and adjustments with strict debit/credit balance progression', async () => {
    // 1. Initial earn: 100 points
    await loyaltyService.recordEarn({
      customerId: testCustomer.id,
      pointsEarned: 100,
      saleId: 'sale-earn-100',
      receiptNumber: 'CR-20260919-000001',
      cashierId: testUser.id,
    });

    // 2. Redemption: Redeem 30 points on Sale #CR-20260919-000002
    const redeemResult = await loyaltyService.recordRedeem({
      customerId: testCustomer.id,
      pointsRedeemed: 30,
      saleId: 'sale-redeem-30',
      receiptNumber: 'CR-20260919-000002',
      cashierId: testUser.id,
    });

    expect(redeemResult.transaction.type).toBe('REDEEM');
    expect(redeemResult.transaction.points_delta).toBe(-30);
    expect(redeemResult.transaction.previous_points).toBe(100);
    expect(redeemResult.transaction.new_points).toBe(70);
    expect(redeemResult.customer.loyalty_points).toBe(70);

    // 3. Manual Adjustment: +15 bonus points awarded by manager
    const adjustResult = await loyaltyService.recordAdjustment({
      customerId: testCustomer.id,
      pointsDelta: 15,
      reason: 'VIP Birthday Bonus',
      cashierId: testUser.id,
    });

    expect(adjustResult.transaction.type).toBe('ADJUST');
    expect(adjustResult.transaction.points_delta).toBe(15);
    expect(adjustResult.transaction.previous_points).toBe(70);
    expect(adjustResult.transaction.new_points).toBe(85);
    expect(adjustResult.customer.loyalty_points).toBe(85);

    // 4. Retrieve complete ledger history
    const ledger = await loyaltyService.getCustomerLedger(testCustomer.id);
    expect(ledger.length).toBe(3);

    // Verify summary metrics
    const summary = await loyaltyService.getLoyaltySummary();
    expect(summary.totalPointsIssued).toBe(115); // 100 earn + 15 adjust
    expect(summary.totalPointsRedeemed).toBe(30);
    expect(summary.totalPointsLiability).toBe(85);
    expect(summary.activeLoyaltyCustomersCount).toBe(1);
  });

  it('integrates loyalty transaction record directly during complete checkout in sales repository', async () => {
    // Open shift
    const shift = await shiftRepo.openShift({
      registerId: testRegister.id,
      cashierId: testUser.id,
      openingFloat: 20000,
    });

    // Perform sale with customer attached:
    // 2 Vanilla Iced Lattes = 16,000 UGX
    // 16,000 / 1,000 = 16 loyalty points earned
    const saleResult = await salesRepo.createSaleTransaction({
      items: [
        {
          product: testProduct,
          quantity: 2,
          unit_price: 8000,
          discount_amount: 0,
          tax_rate: 0,
          item_total: 16000,
        },
      ],
      payments: [{ id: 'p-101', method: 'cash', amount_paid: 16000 }],
      customer: testCustomer,
      shift,
      registerId: testRegister.id,
      cashierId: testUser.id,
    });

    expect(saleResult.sale.receipt_number).toBeDefined();
    expect(saleResult.newCustomerPoints).toBe(16);

    const updatedCustomer = await testDb.customers.get(testCustomer.id);
    expect(updatedCustomer?.loyalty_points).toBe(16);

    // Verify transaction record was written in loyaltyTransactions table
    const loyaltyTxs = await testDb.loyaltyTransactions.toArray();
    expect(loyaltyTxs.length).toBe(1);

    const tx = loyaltyTxs[0];
    expect(tx.type).toBe('EARN');
    expect(tx.points_delta).toBe(16);
    expect(tx.receipt_number).toBe(saleResult.sale.receipt_number);
    expect(tx.sale_id).toBe(saleResult.sale.id);
    expect(tx.previous_points).toBe(0);
    expect(tx.new_points).toBe(16);

    await testDb.close();
  });
});
