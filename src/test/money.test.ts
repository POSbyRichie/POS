import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  parseToMinorUnits,
  calculateLineTotal,
  calculateCartTotals,
  calculatePaymentBreakdown,
  DEFAULT_STORE_INFO,
} from '../utils/money';
import { CartItem, Product } from '../types';

describe('Decimal-Safe Money Utilities', () => {
  it('formats minor units correctly for UGX (0 decimals)', () => {
    expect(formatMoney(45000)).toBe('UGX 45,000');
    expect(formatMoney(0)).toBe('UGX 0');
    expect(formatMoney(-1500)).toBe('-UGX 1,500');
  });

  it('formats minor units correctly for USD (2 decimals)', () => {
    const usdStore = {
      ...DEFAULT_STORE_INFO,
      currency_code: 'USD',
      currency_symbol: '$',
      currency_decimals: 2,
    };
    expect(formatMoney(1250, usdStore)).toBe('$ 12.50');
    expect(formatMoney(99, usdStore)).toBe('$ 0.99');
    expect(formatMoney(100000, usdStore)).toBe('$ 1,000.00');
  });

  it('parses input strings safely into integer minor units', () => {
    expect(parseToMinorUnits('45,000', 0)).toBe(45000);
    expect(parseToMinorUnits('12.50', 2)).toBe(1250);
    expect(parseToMinorUnits('$ 99.95', 2)).toBe(9995);
    expect(parseToMinorUnits('', 0)).toBe(0);
  });

  it('calculates line totals accurately without floating-point errors', () => {
    // 3 items @ 1,500 UGX with 200 UGX discount each = (1,500 - 200) * 3 = 3,900 UGX
    const lineTotal = calculateLineTotal(1500, 200, 3);
    expect(lineTotal).toBe(3900);
  });

  it('calculates complete cart totals including VAT and discounts', () => {
    const sampleProduct1: Product = {
      id: 'p1',
      sku: 'SKU1',
      barcode: '111',
      name: 'Bread',
      category_id: 'c1',
      cost_price: 3000,
      selling_price: 5000,
      tax_rate: 0, // Tax exempt
      unit: 'loaf',
      stock_quantity: 10,
      min_stock_level: 2,
      is_active: true,
      sync_status: 'synced',
      created_at: '',
      updated_at: '',
    };

    const sampleProduct2: Product = {
      id: 'p2',
      sku: 'SKU2',
      barcode: '222',
      name: 'Juice',
      category_id: 'c1',
      cost_price: 4000,
      selling_price: 6500,
      tax_rate: 18, // 18% VAT
      unit: 'bottle',
      stock_quantity: 10,
      min_stock_level: 2,
      is_active: true,
      sync_status: 'synced',
      created_at: '',
      updated_at: '',
    };

    const items: CartItem[] = [
      {
        product: sampleProduct1,
        quantity: 2,
        unit_price: 5000,
        discount_amount: 0,
        tax_rate: 0,
        item_total: 10000,
      },
      {
        product: sampleProduct2,
        quantity: 1,
        unit_price: 6500,
        discount_amount: 500, // Line discount 500
        tax_rate: 18,
        item_total: 6000,
      },
    ];

    // Subtotal = (5000*2) + (6500*1) = 16,500
    // Item discount = 500
    // Net for tax on p2 = 6,000 * 18% = 1,080 tax
    // Grand Total = 16,500 - 500 + 1,080 = 17,080
    const totals = calculateCartTotals(items, 0, 0);

    expect(totals.subtotal).toBe(16500);
    expect(totals.itemDiscountTotal).toBe(500);
    expect(totals.taxTotal).toBe(1080);
    expect(totals.grandTotal).toBe(17080);
    expect(totals.itemCount).toBe(3);
  });

  it('calculates payment split and change correctly', () => {
    const totalDue = 35000;
    const payments = [
      { amount_paid: 20000 },
      { amount_paid: 15000 },
    ];

    const breakdown = calculatePaymentBreakdown(totalDue, payments);
    expect(breakdown.totalPaid).toBe(35000);
    expect(breakdown.remainingDue).toBe(0);
    expect(breakdown.change).toBe(0);
    expect(breakdown.isFullyPaid).toBe(true);

    // Overpayment scenario (Cash change)
    const overpayment = [
      { amount_paid: 50000 }
    ];
    const changeBreakdown = calculatePaymentBreakdown(35000, overpayment);
    expect(changeBreakdown.change).toBe(15000);
    expect(changeBreakdown.remainingDue).toBe(0);
  });
});
