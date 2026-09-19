import { describe, it, expect, beforeEach } from 'vitest';
import { PosDatabase } from '../db/database';
import { ReportService } from '../services/reportService';
import {
  User,
  Register,
  Category,
  Product,
  Customer,
  Shift,
  CashMovement,
  Sale,
  SaleItem,
  PaymentRecord,
  LoyaltyTransaction,
} from '../types';

describe('Authoritative 9-Category Reports & Analytics Test', () => {
  let testDb: PosDatabase;
  let reportService: ReportService;

  beforeEach(async () => {
    const dbName = `test-reports-analytics-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDb = new PosDatabase(dbName);
    await testDb.open();

    reportService = new ReportService(testDb);

    // 1. Seed Users (2 cashiers)
    const cashier1: User = {
      id: 'usr-c1',
      username: 'john_c',
      full_name: 'John Doe',
      name: 'John Doe',
      role: 'cashier',
      pin_hash: '1234',
      salt: 'salt123',
      is_active: true,
    };
    const cashier2: User = {
      id: 'usr-c2',
      username: 'mary_m',
      full_name: 'Mary Manager',
      name: 'Mary Manager',
      role: 'manager',
      pin_hash: '5678',
      salt: 'salt123',
      is_active: true,
    };
    await testDb.users.bulkPut([cashier1, cashier2]);

    // 2. Seed Register
    const register: Register = {
      id: 'reg-01',
      register_name: 'POS Terminal 1',
      branch_name: 'Main Branch',
      is_active: true,
    };
    await testDb.registers.put(register);

    // 3. Seed Categories
    const catBakery: Category = {
      id: 'cat-bakery',
      name: 'Bakery & Pastries',
      slug: 'bakery-pastries',
      color: '#f59e0b',
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const catCoffee: Category = {
      id: 'cat-coffee',
      name: 'Specialty Beverages',
      slug: 'specialty-beverages',
      color: '#3b82f6',
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.categories.bulkPut([catBakery, catCoffee]);

    // 4. Seed Products
    // Bread: cost 2,000, price 3,500, stock 40 (normal)
    const prodBread: Product = {
      id: 'prod-bread',
      sku: 'BREAD-01',
      barcode: '111111111',
      name: 'Artisan Sourdough',
      category_id: 'cat-bakery',
      cost_price: 2000,
      selling_price: 3500,
      tax_rate: 0,
      unit: 'loaf',
      stock_quantity: 40,
      min_stock_level: 10,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // Coffee: cost 1,500, price 5,000, stock 3 (LOW STOCK: min is 5)
    const prodCoffee: Product = {
      id: 'prod-coffee',
      sku: 'COFFEE-01',
      barcode: '222222222',
      name: 'House Roast Cappuccino',
      category_id: 'cat-coffee',
      cost_price: 1500,
      selling_price: 5000,
      tax_rate: 0,
      unit: 'cup',
      stock_quantity: 3,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.bulkPut([prodBread, prodCoffee]);

    // 5. Seed Customer
    const customer: Customer = {
      id: 'cust-01',
      name: 'Kavuma David',
      phone: '+256780000000',
      loyalty_points: 75,
      total_spent: 45000,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.customers.put(customer);

    // 6. Seed Shifts & Cash Movements
    const shift1: Shift = {
      id: 'shift-101',
      idempotency_key: 'idem-shift-101',
      register_id: register.id,
      cashier_id: cashier1.id,
      opened_at: '2026-09-19T08:00:00.000Z',
      closed_at: '2026-09-19T16:00:00.000Z',
      status: 'closed',
      opening_float: 50000,
      closing_cash_actual: 70000,
      closing_cash_expected: 70500,
      variance: -500,
      total_sales: 27500,
      cash_sales_total: 22500,
      card_sales_total: 5000,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      cash_in_total: 10000,
      cash_out_total: 12000,
      transaction_count: 3,
      sync_status: 'synced',
    };
    await testDb.shifts.put(shift1);

    const mov1: CashMovement = {
      id: 'mov-1',
      idempotency_key: 'idem-mov-1',
      shift_id: shift1.id,
      register_id: register.id,
      cashier_id: cashier1.id,
      type: 'PAY_IN',
      amount: 10000,
      reason: 'Petty cash coins',
      timestamp: '2026-09-19T09:00:00.000Z',
      sync_status: 'synced',
    };
    const mov2: CashMovement = {
      id: 'mov-2',
      idempotency_key: 'idem-mov-2',
      shift_id: shift1.id,
      register_id: register.id,
      cashier_id: cashier1.id,
      type: 'PAY_OUT',
      amount: 12000,
      reason: 'Cleaning supplies',
      timestamp: '2026-09-19T11:00:00.000Z',
      sync_status: 'synced',
    };
    await testDb.cashMovements.bulkPut([mov1, mov2]);

    // 7. Seed Sales, SaleItems, and Payments
    // Sale A: Cashier 1, Cash, 2 Breads @ 3500 = 7000, no discount
    const saleA: Sale = {
      id: 'sale-A',
      idempotency_key: 'idem-sale-A',
      receipt_number: 'CR-20260919-000001',
      register_id: register.id,
      shift_id: shift1.id,
      cashier_id: cashier1.id,
      customer_id: customer.id,
      subtotal: 7000,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: 7000,
      amount_paid: 7000,
      change_amount: 0,
      payment_method: 'cash',
      payment_status: 'paid',
      items_count: 2,
      sync_status: 'synced',
      created_at: '2026-09-19T09:30:00.000Z',
      updated_at: '2026-09-19T09:30:00.000Z',
    };
    const itemA: SaleItem = {
      id: 'item-A1',
      sale_id: saleA.id,
      product_id: prodBread.id,
      product_name: prodBread.name,
      sku: prodBread.sku,
      quantity: 2,
      unit_price: 3500,
      discount_amount: 0,
      tax_rate: 0,
      total_price: 7000,
    };
    const payA: PaymentRecord = {
      id: 'pay-A1',
      idempotency_key: 'idem-pay-A1',
      sale_id: saleA.id,
      method: 'cash',
      amount_paid: 7000,
      change_given: 0,
      status: 'successful',
      timestamp: '2026-09-19T09:30:00.000Z',
      sync_status: 'synced',
    };

    // Sale B: Cashier 2, Card, 1 Coffee @ 5000 with 500 item discount = 4500
    const saleB: Sale = {
      id: 'sale-B',
      idempotency_key: 'idem-sale-B',
      receipt_number: 'CR-20260919-000002',
      register_id: register.id,
      shift_id: shift1.id,
      cashier_id: cashier2.id,
      subtotal: 4500,
      discount_amount: 500,
      tax_amount: 0,
      total_amount: 4500,
      amount_paid: 4500,
      change_amount: 0,
      payment_method: 'card',
      payment_status: 'paid',
      items_count: 1,
      sync_status: 'synced',
      created_at: '2026-09-19T10:15:00.000Z',
      updated_at: '2026-09-19T10:15:00.000Z',
    };
    const itemB: SaleItem = {
      id: 'item-B1',
      sale_id: saleB.id,
      product_id: prodCoffee.id,
      product_name: prodCoffee.name,
      sku: prodCoffee.sku,
      quantity: 1,
      unit_price: 5000,
      discount_amount: 500,
      tax_rate: 0,
      total_price: 4500,
    };
    const payB: PaymentRecord = {
      id: 'pay-B1',
      idempotency_key: 'idem-pay-B1',
      sale_id: saleB.id,
      method: 'card',
      amount_paid: 4500,
      change_given: 0,
      status: 'successful',
      timestamp: '2026-09-19T10:15:00.000Z',
      sync_status: 'synced',
    };

    // Sale C: Cashier 1, Cash, 1 Bread (3500) + 1 Coffee (5000) = 8500 with 1000 cart discount = 7500
    const saleC: Sale = {
      id: 'sale-C',
      idempotency_key: 'idem-sale-C',
      receipt_number: 'CR-20260919-000003',
      register_id: register.id,
      shift_id: shift1.id,
      cashier_id: cashier1.id,
      subtotal: 7500,
      discount_amount: 1000,
      tax_amount: 0,
      total_amount: 7500,
      amount_paid: 7500,
      change_amount: 0,
      payment_method: 'cash',
      payment_status: 'paid',
      items_count: 2,
      sync_status: 'synced',
      created_at: '2026-09-19T14:00:00.000Z',
      updated_at: '2026-09-19T14:00:00.000Z',
    };
    const itemC1: SaleItem = {
      id: 'item-C1',
      sale_id: saleC.id,
      product_id: prodBread.id,
      product_name: prodBread.name,
      sku: prodBread.sku,
      quantity: 1,
      unit_price: 3500,
      discount_amount: 0,
      tax_rate: 0,
      total_price: 3500,
    };
    const itemC2: SaleItem = {
      id: 'item-C2',
      sale_id: saleC.id,
      product_id: prodCoffee.id,
      product_name: prodCoffee.name,
      sku: prodCoffee.sku,
      quantity: 1,
      unit_price: 5000,
      discount_amount: 0,
      tax_rate: 0,
      total_price: 5000,
    };
    const payC: PaymentRecord = {
      id: 'pay-C1',
      idempotency_key: 'idem-pay-C1',
      sale_id: saleC.id,
      method: 'cash',
      amount_paid: 7500,
      change_given: 0,
      status: 'successful',
      timestamp: '2026-09-19T14:00:00.000Z',
      sync_status: 'synced',
    };

    await testDb.sales.bulkPut([saleA, saleB, saleC]);
    await testDb.saleItems.bulkPut([itemA, itemB, itemC1, itemC2]);
    await testDb.payments.bulkPut([payA, payB, payC]);

    // 8. Seed Loyalty Transactions
    const lTx1: LoyaltyTransaction = {
      id: 'ltx-1',
      idempotency_key: 'idem-ltx-1',
      customer_id: customer.id,
      sale_id: saleA.id,
      receipt_number: saleA.receipt_number,
      points_delta: 50,
      previous_points: 25,
      new_points: 75,
      type: 'EARN',
      timestamp: '2026-09-19T09:30:00.000Z',
      sync_status: 'synced',
    };
    const lTx2: LoyaltyTransaction = {
      id: 'ltx-2',
      idempotency_key: 'idem-ltx-2',
      customer_id: customer.id,
      points_delta: -10,
      previous_points: 35,
      new_points: 25,
      type: 'REDEEM',
      timestamp: '2026-09-18T12:00:00.000Z',
      sync_status: 'synced',
    };
    await testDb.loyaltyTransactions.bulkPut([lTx1, lTx2]);
  });

  it('1. verifies Daily Sales report aggregation', async () => {
    const dailyReport = await reportService.getDailySalesReport();
    expect(dailyReport.length).toBe(1);

    const today = dailyReport[0];
    expect(today.date).toBe('2026-09-19');
    expect(today.transactionsCount).toBe(3);
    // Total = 7,000 + 4,500 + 7,500 = 19,000
    expect(today.total).toBe(19000);
    // Discounts = 0 + 500 + 1,000 = 1,500
    expect(today.discounts).toBe(1500);
    expect(today.avgTicketValue).toBe(Math.round(19000 / 3));
  });

  it('2. verifies Cashier Sales report breakdown', async () => {
    const cashierReport = await reportService.getCashierSalesReport();
    expect(cashierReport.length).toBe(2);

    const john = cashierReport.find(c => c.cashierId === 'usr-c1');
    expect(john).toBeDefined();
    expect(john?.cashierName).toBe('John Doe');
    expect(john?.transactionsCount).toBe(2);
    expect(john?.totalSales).toBe(14500); // 7,000 + 7,500
    expect(john?.cashSales).toBe(14500);
    expect(john?.discountsGiven).toBe(1000);

    const mary = cashierReport.find(c => c.cashierId === 'usr-c2');
    expect(mary).toBeDefined();
    expect(mary?.cashierName).toBe('Mary Manager');
    expect(mary?.transactionsCount).toBe(1);
    expect(mary?.totalSales).toBe(4500);
    expect(mary?.cardSales).toBe(4500);
    expect(mary?.discountsGiven).toBe(500);
  });

  it('3. verifies Product Sales report with revenue, COGS and profit margin', async () => {
    const productReport = await reportService.getProductSalesReport();
    expect(productReport.length).toBe(2);

    // Artisan Sourdough: 3 units sold @ 3,500 = 10,500 revenue
    // COGS: 3 * 2,000 = 6,000. Profit = 4,500. Margin = 4500 / 10500 = 42.9%
    const bread = productReport.find(p => p.productId === 'prod-bread');
    expect(bread).toBeDefined();
    expect(bread?.unitsSold).toBe(3);
    expect(bread?.totalRevenue).toBe(10500);
    expect(bread?.totalCogs).toBe(6000);
    expect(bread?.totalProfit).toBe(4500);
    expect(bread?.marginPercent).toBe(42.9);
    expect(bread?.categoryName).toBe('Bakery & Pastries');

    // House Roast Cappuccino: 2 units sold (1 @ 4,500 discounted + 1 @ 5,000) = 9,500 revenue
    // COGS: 2 * 1,500 = 3,000. Profit = 6,500. Margin = 6500 / 9500 = 68.4%
    const coffee = productReport.find(p => p.productId === 'prod-coffee');
    expect(coffee).toBeDefined();
    expect(coffee?.unitsSold).toBe(2);
    expect(coffee?.totalRevenue).toBe(9500);
    expect(coffee?.totalCogs).toBe(3000);
    expect(coffee?.totalProfit).toBe(6500);
    expect(coffee?.marginPercent).toBe(68.4);
    expect(coffee?.categoryName).toBe('Specialty Beverages');
  });

  it('4. verifies Payment Methods report distribution', async () => {
    const paymentReport = await reportService.getPaymentMethodsReport();
    
    const cashMethod = paymentReport.find(p => p.method === 'cash');
    expect(cashMethod).toBeDefined();
    expect(cashMethod?.count).toBe(2);
    expect(cashMethod?.totalAmount).toBe(14500);

    const cardMethod = paymentReport.find(p => p.method === 'card');
    expect(cardMethod).toBeDefined();
    expect(cardMethod?.count).toBe(1);
    expect(cardMethod?.totalAmount).toBe(4500);

    // Total = 19,000. Cash share = 14,500 / 19,000 = 76.3%. Card share = 4,500 / 19,000 = 23.7%
    expect(cashMethod?.percentageShare).toBe(76.3);
    expect(cardMethod?.percentageShare).toBe(23.7);
  });

  it('5. verifies Inventory report and low stock warning detection', async () => {
    const invReport = await reportService.getInventoryReport();
    expect(invReport.totalSkus).toBe(2);
    // Stock: 40 bread + 3 coffee = 43 units
    expect(invReport.totalUnitsInStock).toBe(43);
    // Cost: (40 * 2000) + (3 * 1500) = 80,000 + 4,500 = 84,500
    expect(invReport.totalCostValuation).toBe(84500);
    // Retail: (40 * 3500) + (3 * 5000) = 140,000 + 15,000 = 155,000
    expect(invReport.totalRetailValuation).toBe(155000);
    expect(invReport.potentialProfit).toBe(70500);

    // Coffee has stock 3 <= min_stock_level 5, so it must be flagged in lowStockItems
    expect(invReport.lowStockItems.length).toBe(1);
    expect(invReport.lowStockItems[0].id).toBe('prod-coffee');
    expect(invReport.lowStockItems[0].categoryName).toBe('Specialty Beverages');
  });

  it('6. verifies Profit (P&L) report across revenue, cogs, and margins', async () => {
    const profitReport = await reportService.getProfitReport();
    // Gross Revenue = subtotal + discount = (7000+0) + (4500+500) + (7500+1000) = 20,500
    expect(profitReport.totalGrossRevenue).toBe(20500);
    // Total discounts = 1,500
    expect(profitReport.totalDiscounts).toBe(1500);
    // COGS = (3 bread * 2000) + (2 coffee * 1500) = 6,000 + 3,000 = 9,000
    expect(profitReport.totalCogs).toBe(9000);
    // Gross profit = 20,500 - 9,000 - 1,500 = 10,000
    expect(profitReport.totalGrossProfit).toBe(10000);
    // Gross Margin = 10,000 / 20,500 = 48.8%
    expect(profitReport.grossMarginPercent).toBe(48.8);

    expect(profitReport.categoryProfitability.length).toBe(2);
  });

  it('7. verifies Discounts report including item-level vs cart-level breakdown', async () => {
    const discountsReport = await reportService.getDiscountsReport();
    expect(discountsReport.totalDiscountsGiven).toBe(1500);
    expect(discountsReport.itemLevelDiscounts).toBe(500); // 1 coffee discounted 500
    expect(discountsReport.cartLevelDiscounts).toBe(1000); // 1000 cart discount on Sale C
    expect(discountsReport.discountedTransactionsCount).toBe(2); // Sale B and Sale C
    expect(discountsReport.totalTransactionsCount).toBe(3);

    expect(discountsReport.topDiscountedProducts.length).toBe(1);
    expect(discountsReport.topDiscountedProducts[0].productId).toBe('prod-coffee');
    expect(discountsReport.topDiscountedProducts[0].totalDiscount).toBe(500);

    expect(discountsReport.cashierDiscounts.length).toBe(2);
  });

  it('8. verifies Shifts report with expected cash, actual cash, and variance', async () => {
    const shiftsReport = await reportService.getShiftsReport();
    expect(shiftsReport.length).toBe(1);

    const shiftRow = shiftsReport[0];
    expect(shiftRow.shiftId).toBe('shift-101');
    expect(shiftRow.cashierName).toBe('John Doe');
    expect(shiftRow.registerName).toBe('POS Terminal 1');
    expect(shiftRow.status).toBe('closed');
    expect(shiftRow.openingFloat).toBe(50000);
    expect(shiftRow.cashSales).toBe(22500);
    expect(shiftRow.cashIn).toBe(10000);
    expect(shiftRow.cashOut).toBe(12000);
    expect(shiftRow.expectedCash).toBe(70500);
    expect(shiftRow.actualCash).toBe(70000);
    expect(shiftRow.variance).toBe(-500);
    expect(shiftRow.movements.length).toBe(2);
  });

  it('9. verifies Loyalty report metrics and top customer ledger summaries', async () => {
    const loyaltyReport = await reportService.getLoyaltyReport();
    expect(loyaltyReport.totalPointsIssued).toBe(50);
    expect(loyaltyReport.totalPointsRedeemed).toBe(10);
    expect(loyaltyReport.totalPointsLiability).toBe(75);
    expect(loyaltyReport.activeLoyaltyCustomersCount).toBe(1);
    expect(loyaltyReport.topCustomers.length).toBe(1);
    expect(loyaltyReport.topCustomers[0].name).toBe('Kavuma David');
    expect(loyaltyReport.recentTransactions.length).toBe(2);

    await testDb.close();
  });
});
