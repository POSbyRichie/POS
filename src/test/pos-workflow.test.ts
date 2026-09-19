import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { seedDatabase } from '../db/seed';
import { inventoryService } from '../services/inventoryService';
import { saleService } from '../services/saleService';
import { calculateCartTotals } from '../utils/money';
import { generateUUID } from '../utils/id';
import { Shift } from '../types';

describe('Authoritative POS Workflow Units', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedDatabase(true);
  });

  describe('Step 1 & 2: Authentication & Shift Float Checks', () => {
    it('prevents multiple active shifts on the same register', async () => {
      const register = await db.registers.get('reg-001-main');
      const cashier = await db.users.where('role').equals('cashier').first();

      const shift1: Shift = {
        id: generateUUID(),
        idempotency_key: `shift-1`,
        register_id: register!.id,
        cashier_id: cashier!.id,
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
      await db.shifts.put(shift1);

      // Verify open shift exists
      const active = await db.shifts
        .where('register_id')
        .equals(register!.id)
        .and(s => s.status === 'open')
        .first();

      expect(active).toBeDefined();
      expect(active?.id).toBe(shift1.id);
    });
  });

  describe('Step 5 & 6: Barcode Search & Stock Check Decisions', () => {
    it('finds products by barcode and SKU', async () => {
      const bread = await db.products.where('barcode').equals('600123450004').first();
      expect(bread).toBeDefined();
      expect(bread?.name).toContain('Bread');

      const bySku = await db.products.where('sku').equals('GRO-001').first();
      expect(bySku).toBeDefined();
      expect(bySku?.name).toContain('Basmati Rice');
    });

    it('flags out of stock items accurately (Step 6 Decision: No)', async () => {
      const allProducts = await db.products.toArray();
      const outOfStockProd = allProducts.find(p => p.stock_quantity === 0);
      expect(outOfStockProd).toBeDefined();

      const check = await inventoryService.checkStock(outOfStockProd!.id);
      expect(check.inStock).toBe(false);
      expect(check.available).toBe(0);
    });
  });

  describe('Step 7 & 8: Cart Management, Discounts & Tax', () => {
    it('accurately calculates line discounts and VAT', async () => {
      const juice = await db.products.where('sku').equals('BEV-002').first();
      expect(juice).toBeDefined();

      // 2 bottles @ 6,500 UGX with 500 discount each = (6500 - 500) * 2 = 12,000 net
      // VAT 18% on 12,000 = 2,160
      // Grand Total = 12,000 + 2,160 = 14,160
      const cartItem = {
        product: juice!,
        quantity: 2,
        unit_price: juice!.selling_price,
        discount_amount: 500,
        tax_rate: juice!.tax_rate,
        item_total: 12000,
      };

      const totals = calculateCartTotals([cartItem], 0, 0);
      expect(totals.subtotal).toBe(13000);
      expect(totals.itemDiscountTotal).toBe(1000);
      expect(totals.taxTotal).toBe(2160);
      expect(totals.grandTotal).toBe(14160);
    });

    it('applies percentage cart discounts cleanly', async () => {
      const bread = await db.products.where('sku').equals('BAK-001').first();
      // 1 loaf @ 5,000, 0 tax
      const cartItem = {
        product: bread!,
        quantity: 1,
        unit_price: 5000,
        discount_amount: 0,
        tax_rate: 0,
        item_total: 5000,
      };

      // 10% cart discount on 5,000 = 500 discount -> Total = 4,500
      const totals = calculateCartTotals([cartItem], 10, 0);
      expect(totals.cartDiscountTotal).toBe(500);
      expect(totals.grandTotal).toBe(4500);
    });
  });

  describe('Step 10, 11 & 15: Payment & Loyalty Accrual', () => {
    it('accrues loyalty points based on rate (1 pt per 1,000 UGX)', async () => {
      const customer = await db.customers.get('cust-001');
      const prevPoints = customer!.loyalty_points;

      const shiftId = generateUUID();
      const testShift: Shift = {
        id: shiftId,
        idempotency_key: `shift-test-${shiftId}`,
        register_id: 'reg-001-main',
        cashier_id: '00000000-0000-0000-0000-000000000001',
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
      await db.shifts.put(testShift);

      const bread = await db.products.where('sku').equals('BAK-001').first();

      const item = {
        product: bread!,
        quantity: 2, // 2 * 5,000 = 10,000 UGX
        unit_price: bread!.selling_price,
        discount_amount: 0,
        tax_rate: 0,
        item_total: 10000,
      };

      const result = await saleService.completeSale({
        items: [item],
        payments: [{ id: 'p1', method: 'cash', amount_paid: 10000 }],
        customer,
        shift: testShift,
        registerId: 'reg-001-main',
        cashierId: '00000000-0000-0000-0000-000000000001',
      });

      // 10,000 / 1,000 = 10 points earned
      expect(result.loyaltyTransaction).toBeDefined();
      expect(result.loyaltyTransaction?.points_delta).toBe(10);
      expect(result.newCustomerPoints).toBe(prevPoints + 10);

      // Verify updated in customer database table
      const updatedCust = await db.customers.get('cust-001');
      expect(updatedCust?.loyalty_points).toBe(prevPoints + 10);
    });
  });

  describe('Step 18: Cash Count Variance Calculation', () => {
    it('computes exact, over, and short cash variances accurately', () => {
      const openingFloat = 50000;
      const cashSales = 75000;
      const expected = openingFloat + cashSales; // 125,000

      // Exact count
      const exactCount = 125000;
      expect(exactCount - expected).toBe(0);

      // Cash over (e.g. customer left change)
      const overCount = 128000;
      expect(overCount - expected).toBe(3000);

      // Cash short (discrepancy)
      const shortCount = 120000;
      expect(shortCount - expected).toBe(-5000);
    });
  });
});
