import { CartItem, StoreInfo } from '../types';

export const DEFAULT_STORE_INFO: StoreInfo = {
  name: 'Antigravity Enterprise POS',
  tagline: 'Reliable Offline-First Retail Solutions',
  address: 'Plot 42 Kampala Road, Suite 100, Kampala, Uganda',
  phone: '+256 700 123 456',
  email: 'support@antigravitypos.io',
  tax_id: 'TIN-987654321',
  currency_code: 'UGX',
  currency_symbol: 'UGX',
  currency_decimals: 0, // UGX operates on whole integer shillings
  loyalty_rate: 1000 // 1 point per 1,000 UGX spent
};

/**
 * Format minor units into human readable currency string
 */
export function formatMoney(amountInMinorUnits: number, storeInfo: StoreInfo = DEFAULT_STORE_INFO): string {
  const isNegative = amountInMinorUnits < 0;
  const absAmount = Math.abs(amountInMinorUnits);

  let formattedNumber: string;
  if (storeInfo.currency_decimals === 0) {
    formattedNumber = Math.round(absAmount).toLocaleString('en-US');
  } else {
    const divisor = Math.pow(10, storeInfo.currency_decimals);
    const majorUnits = absAmount / divisor;
    formattedNumber = majorUnits.toLocaleString('en-US', {
      minimumFractionDigits: storeInfo.currency_decimals,
      maximumFractionDigits: storeInfo.currency_decimals,
    });
  }

  const sign = isNegative ? '-' : '';
  return `${sign}${storeInfo.currency_symbol} ${formattedNumber}`;
}

/**
 * Parse input string or decimal number safely to integer minor units
 */
export function parseToMinorUnits(input: string | number, decimals: number = DEFAULT_STORE_INFO.currency_decimals): number {
  if (typeof input === 'number') {
    if (isNaN(input)) return 0;
    return Math.round(input * Math.pow(10, decimals));
  }

  const sanitized = input.replace(/[^0-9.-]/g, '');
  if (!sanitized) return 0;

  const num = parseFloat(sanitized);
  if (isNaN(num)) return 0;

  return Math.round(num * Math.pow(10, decimals));
}

/**
 * Calculate single line item total in minor units:
 * (UnitPrice - LineDiscount) * Quantity
 */
export function calculateLineTotal(unitPrice: number, discountAmount: number, quantity: number): number {
  const safeQty = Math.max(0, quantity);
  const netUnitPrice = Math.max(0, unitPrice - discountAmount);
  return Math.round(netUnitPrice * safeQty);
}

export interface CartTotals {
  subtotal: number;
  itemDiscountTotal: number;
  cartDiscountTotal: number;
  totalDiscount: number;
  taxTotal: number;
  grandTotal: number;
  itemCount: number;
}

/**
 * Calculate cart summary using decimal-safe minor unit integer arithmetic
 */
export function calculateCartTotals(
  items: CartItem[],
  cartDiscountPercent: number = 0,
  cartDiscountFixed: number = 0
): CartTotals {
  let subtotal = 0;
  let itemDiscountTotal = 0;
  let taxTotal = 0;
  let itemCount = 0;

  for (const item of items) {
    const qty = Math.max(0, item.quantity);
    itemCount += qty;

    const lineGross = Math.round(item.unit_price * qty);
    const lineDiscount = Math.round((item.discount_amount || 0) * qty);
    const lineNet = Math.max(0, lineGross - lineDiscount);

    subtotal += lineGross;
    itemDiscountTotal += lineDiscount;

    if (item.tax_rate && item.tax_rate > 0) {
      // Calculate tax on net item amount: Net * (Rate / 100)
      const lineTax = Math.round((lineNet * item.tax_rate) / 100);
      taxTotal += lineTax;
    }
  }

  const rawNetSubtotal = Math.max(0, subtotal - itemDiscountTotal);

  // Cart-level discount
  let cartDiscountTotal = 0;
  if (cartDiscountPercent > 0) {
    cartDiscountTotal += Math.round((rawNetSubtotal * Math.min(100, cartDiscountPercent)) / 100);
  }
  if (cartDiscountFixed > 0) {
    cartDiscountTotal += Math.round(cartDiscountFixed);
  }
  cartDiscountTotal = Math.min(rawNetSubtotal, cartDiscountTotal);

  const totalDiscount = itemDiscountTotal + cartDiscountTotal;
  const grandTotal = Math.max(0, subtotal - totalDiscount + taxTotal);

  return {
    subtotal,
    itemDiscountTotal,
    cartDiscountTotal,
    totalDiscount,
    taxTotal,
    grandTotal,
    itemCount
  };
}

/**
 * Compute payment balances (total paid, remaining due, change)
 */
export function calculatePaymentBreakdown(totalDue: number, payments: { amount_paid: number }[]) {
  const totalPaid = payments.reduce((acc, p) => acc + (p.amount_paid || 0), 0);
  const remainingDue = Math.max(0, totalDue - totalPaid);
  const change = Math.max(0, totalPaid - totalDue);

  return {
    totalDue,
    totalPaid,
    remainingDue,
    change,
    isFullyPaid: totalPaid >= totalDue && totalDue > 0
  };
}
