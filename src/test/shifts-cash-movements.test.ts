import { describe, it, expect, beforeEach } from 'vitest';
import { PosDatabase } from '../db/database';
import { ShiftRepository } from '../db/repositories/shiftRepository';
import { SalesRepository } from '../db/repositories/salesRepository';
import { Register, Product, User } from '../types';

describe('Authoritative Shifts, Cash Movements & Drawer Variance Reconciliation Test', () => {
  let testDb: PosDatabase;
  let shiftRepo: ShiftRepository;
  let salesRepo: SalesRepository;

  let testRegister: Register;
  let cashierUser: User;
  let testProduct: Product;

  beforeEach(async () => {
    const dbName = `test-shifts-cash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDb = new PosDatabase(dbName);
    await testDb.open();

    shiftRepo = new ShiftRepository(testDb);
    salesRepo = new SalesRepository(testDb);

    testRegister = {
      id: 'reg-01-main',
      register_name: 'Main Counter Register',
      branch_name: 'Kampala Central',
      is_active: true,
    };
    await testDb.registers.put(testRegister);

    cashierUser = {
      id: 'user-cashier-01',
      username: 'rcashier',
      full_name: 'Robert Cashier',
      name: 'Robert Cashier',
      role: 'cashier',
      pin_hash: '1234',
      salt: 'salt123',
      is_active: true,
    };
    await testDb.users.put(cashierUser);

    testProduct = {
      id: 'prod-bread-01',
      sku: 'BREAD-001',
      barcode: '600123456789',
      name: 'Whole Wheat Loaf',
      category_id: 'cat-bakery',
      cost_price: 2000,
      selling_price: 3500,
      tax_rate: 0,
      unit: 'loaf',
      stock_quantity: 100,
      min_stock_level: 10,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(testProduct);
  });

  it('strictly executes the complete shift flow: Open Shift -> Sales -> Cash movements -> Close Shift -> Expected Cash -> Actual Cash -> Variance', async () => {
    // 1. OPEN SHIFT: Cashier opens shift with 50,000 UGX float
    const openingFloat = 50000;
    const shift = await shiftRepo.openShift({
      registerId: testRegister.id,
      cashierId: cashierUser.id,
      openingFloat,
    });

    expect(shift.status).toBe('open');
    expect(shift.opening_float).toBe(50000);
    expect(shift.cash_sales_total).toBe(0);
    expect(shift.cash_in_total).toBe(0);
    expect(shift.cash_out_total).toBe(0);

    // 2. SALES: Perform 2 cash sales and 1 card sale
    // Sale 1: Cash sale of 7,000 UGX (2 loaves)
    await salesRepo.createSaleTransaction({
      items: [
        {
          product: testProduct,
          quantity: 2,
          unit_price: 3500,
          discount_amount: 0,
          tax_rate: 0,
          item_total: 7000,
        },
      ],
      payments: [{ id: 'p-1', method: 'cash', amount_paid: 7000 }],
      shift,
      registerId: testRegister.id,
      cashierId: cashierUser.id,
    });

    // Sale 2: Card sale of 10,500 UGX (3 loaves) - does not add cash to drawer
    await salesRepo.createSaleTransaction({
      items: [
        {
          product: testProduct,
          quantity: 3,
          unit_price: 3500,
          discount_amount: 0,
          tax_rate: 0,
          item_total: 10500,
        },
      ],
      payments: [{ id: 'p-2', method: 'card', amount_paid: 10500 }],
      shift,
      registerId: testRegister.id,
      cashierId: cashierUser.id,
    });

    // Sale 3: Cash sale of 3,500 UGX (1 loaf)
    await salesRepo.createSaleTransaction({
      items: [
        {
          product: testProduct,
          quantity: 1,
          unit_price: 3500,
          discount_amount: 0,
          tax_rate: 0,
          item_total: 3500,
        },
      ],
      payments: [{ id: 'p-3', method: 'cash', amount_paid: 3500 }],
      shift,
      registerId: testRegister.id,
      cashierId: cashierUser.id,
    });

    const shiftAfterSales = await shiftRepo.get(shift.id);
    expect(shiftAfterSales?.cash_sales_total).toBe(10500); // 7,000 + 3,500
    expect(shiftAfterSales?.card_sales_total).toBe(10500);
    expect(shiftAfterSales?.total_sales).toBe(21000);

    // 3. CASH MOVEMENTS:
    // a) PAY_IN: Manager adds 20,000 UGX petty cash change
    const payIn = await shiftRepo.recordCashMovement({
      shiftId: shift.id,
      registerId: testRegister.id,
      cashierId: cashierUser.id,
      type: 'PAY_IN',
      amount: 20000,
      reason: 'Additional coin float from manager',
    });
    expect(payIn.type).toBe('PAY_IN');
    expect(payIn.amount).toBe(20000);

    // b) PAY_OUT: Cashier pays delivery rider 5,000 UGX cash expense
    const payOut = await shiftRepo.recordCashMovement({
      shiftId: shift.id,
      registerId: testRegister.id,
      cashierId: cashierUser.id,
      type: 'PAY_OUT',
      amount: 5000,
      reason: 'Paid courier delivery fee',
    });
    expect(payOut.type).toBe('PAY_OUT');
    expect(payOut.amount).toBe(5000);

    // c) SAFE_DROP: Cashier drops 15,000 UGX excess cash to the safe
    const safeDrop = await shiftRepo.recordCashMovement({
      shiftId: shift.id,
      registerId: testRegister.id,
      cashierId: cashierUser.id,
      type: 'SAFE_DROP',
      amount: 15000,
      reason: 'Mid-afternoon cash drop to drop safe',
    });
    expect(safeDrop.type).toBe('SAFE_DROP');
    expect(safeDrop.amount).toBe(15000);

    // Verify all 3 movements are stored and retrievable
    const recordedMovements = await shiftRepo.getCashMovements(shift.id);
    expect(recordedMovements.length).toBe(3);

    // 4. EXPECTED CASH CALCULATION:
    // Expected Cash = Opening Float (50,000) + Cash Sales (10,500) + Pay In (20,000) - Pay Out (5,000) - Safe Drop (15,000)
    // Expected Cash = 50,000 + 10,500 + 20,000 - 20,000 = 60,500 UGX
    const reconciliation = await shiftRepo.calculateExpectedCash(shift.id);
    expect(reconciliation.openingFloat).toBe(50000);
    expect(reconciliation.cashSales).toBe(10500);
    expect(reconciliation.cashIn).toBe(20000);
    expect(reconciliation.cashOut).toBe(20000);
    expect(reconciliation.expectedCash).toBe(60500);

    // 5. CLOSE SHIFT & VARIANCE:
    // Cashier counts 60,000 UGX physically in drawer (short 500 UGX)
    const actualCash = 60000;
    const closedShift = await shiftRepo.closeShift({
      shiftId: shift.id,
      cashierId: cashierUser.id,
      closingCashActual: actualCash,
      notes: 'Drawer count verified. Discrepancy explained by small coin shortage.',
    });

    expect(closedShift.status).toBe('closed');
    expect(closedShift.closing_cash_expected).toBe(60500);
    expect(closedShift.closing_cash_actual).toBe(60000);
    expect(closedShift.variance).toBe(-500); // 60,000 - 60,500 = -500 UGX
    expect(closedShift.cash_in_total).toBe(20000);
    expect(closedShift.cash_out_total).toBe(20000);

    // 6. AUDIT TRAIL VERIFICATION:
    const auditLogs = await testDb.auditLogs.toArray();
    expect(auditLogs.some(a => a.action === 'SHIFT_OPENED')).toBe(true);
    expect(auditLogs.some(a => a.action === 'CASH_PAY_IN')).toBe(true);
    expect(auditLogs.some(a => a.action === 'CASH_PAY_OUT')).toBe(true);
    expect(auditLogs.some(a => a.action === 'CASH_SAFE_DROP')).toBe(true);
    expect(auditLogs.some(a => a.action === 'SHIFT_CLOSED')).toBe(true);

    // 7. SYNC QUEUE VERIFICATION:
    const syncQueueItems = await testDb.syncQueue.toArray();
    expect(syncQueueItems.some(q => q.entity_type === 'cash_movement')).toBe(true);
    expect(syncQueueItems.some(q => q.entity_type === 'shift' && q.operation === 'UPDATE')).toBe(true);

    await testDb.close();
  });
});
