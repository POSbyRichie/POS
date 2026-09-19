import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  salesRepository,
  inventoryRepository,
  shiftRepository,
  customerRepository,
  productRepository,
} from '../db';
import { Product, Shift, CartItem, PaymentBreakdown } from '../types';
import { generateUUID } from '../utils/id';

describe('IndexedDB Primary Transaction Store & Repositories', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await Promise.all([
      db.sales.clear(),
      db.saleItems.clear(),
      db.payments.clear(),
      db.products.clear(),
      db.inventoryMovements.clear(),
      db.shifts.clear(),
      db.customers.clear(),
      db.loyaltyTransactions.clear(),
      db.receipts.clear(),
      db.syncQueue.clear(),
      db.syncErrors.clear(),
      db.auditLogs.clear(),
    ]);
  });

  it('executes atomic checkout transaction committing 7+ entities simultaneously', async () => {
    // 1. Seed Product
    const testProduct: Product = {
      id: 'prod-milk-01',
      sku: 'SKU-MILK',
      barcode: '600100100',
      name: 'Fresh Dairy Milk 1L',
      category_id: 'cat-dairy',
      cost_price: 3000,
      selling_price: 4500,
      tax_rate: 18,
      unit: 'pcs',
      stock_quantity: 50,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await productRepository.put(testProduct);

    // 2. Open Shift
    const shift = await shiftRepository.openShift({
      registerId: 'reg-01',
      cashierId: 'user-cashier-01',
      openingFloat: 100000,
    });

    // 3. Seed Customer
    const customer = await customerRepository.createCustomer({
      name: 'Alice Nansubuga',
      phone: '+256701234567',
      loyalty_number: 'LOYAL-1001',
      loyalty_points: 10,
      sync_status: 'synced',
    });

    // 4. Perform checkout via salesRepository
    // Subtotal = 3 * 4500 = 13500. 18% VAT = 2430. Grand Total = 15930.
    const cartItems: CartItem[] = [
      {
        product: testProduct,
        quantity: 3,
        unit_price: 4500,
        discount_amount: 0,
        tax_rate: 18,
        item_total: 13500,
      },
    ];

    const payments: PaymentBreakdown[] = [
      {
        id: generateUUID(),
        method: 'cash',
        amount_paid: 20000,
      },
    ];

    const result = await salesRepository.createSaleTransaction({
      items: cartItems,
      payments,
      customer,
      shift,
      registerId: 'reg-01',
      cashierId: 'user-cashier-01',
    });

    // Verify Sale Record (Subtotal: 13500, Tax: 2430, Total: 15930, Paid: 20000, Change: 4070)
    expect(result.sale.id).toBeDefined();
    expect(result.sale.subtotal).toBe(13500);
    expect(result.sale.tax_amount).toBe(2430);
    expect(result.sale.total_amount).toBe(15930);
    expect(result.sale.amount_paid).toBe(20000);
    expect(result.sale.change_amount).toBe(4070);
    expect(result.sale.sync_status).toBe('pending');

    // Verify Sale Items
    const storedItems = await db.saleItems.where('sale_id').equals(result.sale.id).toArray();
    expect(storedItems).toHaveLength(1);
    expect(storedItems[0].quantity).toBe(3);

    // Verify Payments
    const storedPayments = await db.payments.where('sale_id').equals(result.sale.id).toArray();
    expect(storedPayments).toHaveLength(1);
    expect(storedPayments[0].amount_paid).toBe(20000);
    expect(storedPayments[0].change_given).toBe(4070);

    // Verify Product Stock Decrement
    const updatedProduct = await productRepository.get('prod-milk-01');
    expect(updatedProduct?.stock_quantity).toBe(47); // 50 - 3

    // Verify Inventory Movement
    const movements = await inventoryRepository.getMovementsByProduct('prod-milk-01');
    expect(movements).toHaveLength(1);
    expect(movements[0].quantity_delta).toBe(-3);
    expect(movements[0].previous_quantity).toBe(50);
    expect(movements[0].new_quantity).toBe(47);
    expect(movements[0].type).toBe('SALE');

    // Verify Shift Running Totals
    const updatedShift = await shiftRepository.get(shift.id);
    expect(updatedShift?.total_sales).toBe(15930);
    expect(updatedShift?.transaction_count).toBe(1);
    expect(updatedShift?.cash_sales_total).toBe(15930);

    // Verify Customer Loyalty Points Accrual
    const updatedCustomer = await customerRepository.get(customer.id);
    expect(updatedCustomer?.loyalty_points).toBeGreaterThan(10);

    // Verify Receipt
    const receipt = await db.receipts.where('sale_id').equals(result.sale.id).first();
    expect(receipt).toBeDefined();
    expect(receipt?.receipt_number).toBe(result.sale.receipt_number);

    // Verify Sync Queue entries
    const syncItems = await db.syncQueue.toArray();
    expect(syncItems.length).toBeGreaterThanOrEqual(4); // sale, receipt, inventory_movement, loyalty_transaction
    expect(syncItems.some(i => i.entity_type === 'sale')).toBe(true);
    expect(syncItems.some(i => i.entity_type === 'inventory_movement')).toBe(true);
  });

  it('rolls back completely if an error occurs during checkout transaction', async () => {
    const shift: Shift = {
      id: 'shift-rollback-test',
      idempotency_key: 'shift-key-1',
      register_id: 'reg-01',
      cashier_id: 'user-01',
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
    await shiftRepository.put(shift);

    // Product with stock 10
    await productRepository.put({
      id: 'prod-rollback-01',
      sku: 'SKU-ROLLBACK',
      barcode: '999999',
      name: 'Rollback Test Product',
      category_id: 'cat-test',
      cost_price: 1000,
      selling_price: 2000,
      tax_rate: 0,
      unit: 'pcs',
      stock_quantity: 10,
      min_stock_level: 1,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const cartItems: CartItem[] = [
      {
        product: (await productRepository.get('prod-rollback-01'))!,
        quantity: 2,
        unit_price: 2000,
        discount_amount: 0,
        tax_rate: 0,
        item_total: 4000,
      },
    ];

    // Underpayment error triggers validation throw before commit
    await expect(
      salesRepository.createSaleTransaction({
        items: cartItems,
        payments: [{ id: generateUUID(), method: 'cash', amount_paid: 1000 }], // Underpaid! 1000 < 4000
        shift,
        registerId: 'reg-01',
        cashierId: 'user-01',
      })
    ).rejects.toThrow(/Insufficient payment/);

    // Confirm no orphaned records were created
    const salesCount = await db.sales.count();
    const itemsCount = await db.saleItems.count();
    const movementsCount = await db.inventoryMovements.count();
    const product = await productRepository.get('prod-rollback-01');

    expect(salesCount).toBe(0);
    expect(itemsCount).toBe(0);
    expect(movementsCount).toBe(0);
    expect(product?.stock_quantity).toBe(10); // Unchanged!
  });

  it('handles manual inventory adjustment atomically', async () => {
    await productRepository.put({
      id: 'prod-juice-01',
      sku: 'SKU-JUICE',
      barcode: '555555',
      name: 'Orange Juice 500ml',
      category_id: 'cat-beverages',
      cost_price: 2000,
      selling_price: 3500,
      tax_rate: 18,
      unit: 'pcs',
      stock_quantity: 20,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const movement = await inventoryRepository.adjustStock(
      'prod-juice-01',
      15, // +15 restock
      'RESTOCK',
      'reg-01',
      'user-mgr-01',
      'Morning supplier delivery'
    );

    expect(movement.quantity_delta).toBe(15);
    expect(movement.previous_quantity).toBe(20);
    expect(movement.new_quantity).toBe(35);

    const product = await productRepository.get('prod-juice-01');
    expect(product?.stock_quantity).toBe(35);

    const syncItem = await db.syncQueue
      .where('entity_type')
      .equals('inventory_movement')
      .first();
    expect(syncItem).toBeDefined();
    expect(syncItem?.entity_id).toBe(movement.id);
  });

  it('manages shift closing with cash reconciliation and variance calculation', async () => {
    const shift = await shiftRepository.openShift({
      registerId: 'reg-02',
      cashierId: 'user-cashier-02',
      openingFloat: 50000,
    });

    // Manually add cash sales
    await shiftRepository.update(shift.id, {
      cash_sales_total: 120000,
      total_sales: 120000,
      transaction_count: 5,
    });

    // Actual drawer cash counted at end of shift: 168000
    // Expected: 50000 + 120000 = 170000
    // Variance: 168000 - 170000 = -2000 (cash short)
    const closed = await shiftRepository.closeShift({
      shiftId: shift.id,
      cashierId: 'user-cashier-02',
      closingCashActual: 168000,
      notes: 'Slight cash shortage of 2,000 UGX',
    });

    expect(closed.status).toBe('closed');
    expect(closed.closing_cash_expected).toBe(170000);
    expect(closed.closing_cash_actual).toBe(168000);
    expect(closed.variance).toBe(-2000);
    expect(closed.closed_at).toBeDefined();
  });

  it('searches and filters products by barcode, SKU, and text', async () => {
    await productRepository.bulkPut([
      {
        id: 'p1',
        sku: 'SKU-APPLE',
        barcode: '11111111',
        name: 'Crisp Red Apple',
        category_id: 'cat-fruits',
        cost_price: 500,
        selling_price: 1000,
        tax_rate: 0,
        unit: 'pcs',
        stock_quantity: 100,
        min_stock_level: 10,
        is_active: true,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'p2',
        sku: 'SKU-BANANA',
        barcode: '22222222',
        name: 'Sweet Yellow Banana',
        category_id: 'cat-fruits',
        cost_price: 400,
        selling_price: 800,
        tax_rate: 0,
        unit: 'kg',
        stock_quantity: 80,
        min_stock_level: 10,
        is_active: true,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const byBarcode = await productRepository.getByBarcode('11111111');
    expect(byBarcode?.name).toBe('Crisp Red Apple');

    const bySku = await productRepository.getBySku('SKU-BANANA');
    expect(bySku?.name).toBe('Sweet Yellow Banana');

    const textSearch = await productRepository.search('banana');
    expect(textSearch).toHaveLength(1);
    expect(textSearch[0].sku).toBe('SKU-BANANA');
  });
});
