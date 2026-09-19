import { db } from '../db';
import {
  CartItem,
  PaymentBreakdown,
  Sale,
  SaleItem,
  PaymentRecord,
  Receipt,
  LoyaltyTransaction,
  Customer,
  Shift,
  PaymentMethod,
} from '../types';
import { generateUUID, generateReceiptNumber } from '../utils/id';
import { calculateCartTotals, DEFAULT_STORE_INFO } from '../utils/money';
import { inventoryService } from './inventoryService';

export interface CompleteSaleParams {
  items: CartItem[];
  cartDiscountPercent?: number;
  cartDiscountFixed?: number;
  payments: PaymentBreakdown[];
  customer?: Customer | null;
  shift: Shift;
  registerId: string;
  cashierId: string;
  notes?: string;
  emailReceipt?: boolean;
  smsReceipt?: boolean;
  emailRecipient?: string;
  smsRecipient?: string;
}

export interface CompleteSaleResult {
  sale: Sale;
  items: SaleItem[];
  payments: PaymentRecord[];
  receipt: Receipt;
  loyaltyTransaction?: LoyaltyTransaction | null;
  newCustomerPoints?: number;
}

export class SaleService {
  /**
   * Execute atomic local sale completion (Steps 10 -> 16)
   * 1. Validate payments and totals
   * 2. Insert Sale, SaleItems, and Payments
   * 3. Decrement Inventory & log movements (Step 13)
   * 4. Update Shift sales aggregates (Step 14)
   * 5. Accrue Loyalty points (Step 15)
   * 6. Generate printable & queueable Receipt (Step 12)
   * 7. Enqueue sync payloads for Supabase
   */
  async completeSale(params: CompleteSaleParams): Promise<CompleteSaleResult> {
    const {
      items,
      cartDiscountPercent = 0,
      cartDiscountFixed = 0,
      payments,
      customer,
      shift,
      registerId,
      cashierId,
      notes,
      emailReceipt = false,
      smsReceipt = false,
      emailRecipient,
      smsRecipient,
    } = params;

    if (!items || items.length === 0) {
      throw new Error('Cannot complete sale with empty cart');
    }

    const totals = calculateCartTotals(items, cartDiscountPercent, cartDiscountFixed);
    const totalPaid = payments.reduce((acc, p) => acc + (p.amount_paid || 0), 0);

    if (totalPaid < totals.grandTotal) {
      throw new Error(`Insufficient payment: paid ${totalPaid} of ${totals.grandTotal}`);
    }

    const changeAmount = Math.max(0, totalPaid - totals.grandTotal);
    const saleId = generateUUID();
    const idempotencyKey = `sale-${saleId}`;
    const receiptNumber = generateReceiptNumber();
    const now = new Date().toISOString();

    // Determine primary payment method or 'split'
    const paymentMethod: PaymentMethod = payments.length === 1 ? payments[0].method : 'split';

    const saleRecord: Sale = {
      id: saleId,
      idempotency_key: idempotencyKey,
      receipt_number: receiptNumber,
      shift_id: shift.id,
      register_id: registerId,
      cashier_id: cashierId,
      customer_id: customer?.id,
      subtotal: totals.subtotal,
      discount_amount: totals.totalDiscount,
      tax_amount: totals.taxTotal,
      total_amount: totals.grandTotal,
      amount_paid: totalPaid,
      change_amount: changeAmount,
      payment_method: paymentMethod,
      payment_status: 'paid',
      items_count: totals.itemCount,
      notes,
      sync_status: 'pending',
      created_at: now,
      updated_at: now,
    };

    const saleItemRecords: SaleItem[] = items.map(item => ({
      id: generateUUID(),
      sale_id: saleId,
      product_id: item.product.id,
      sku: item.product.sku,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount || 0,
      tax_rate: item.tax_rate,
      total_price: item.item_total,
    }));

    const paymentRecords: PaymentRecord[] = payments.map((p, idx) => ({
      id: generateUUID(),
      idempotency_key: `pay-${saleId}-${idx}`,
      sale_id: saleId,
      method: p.method,
      amount_paid: p.amount_paid,
      change_given: idx === 0 ? changeAmount : 0,
      reference: p.reference,
      status: 'successful',
      timestamp: now,
      sync_status: 'pending',
    }));

    let loyaltyTx: LoyaltyTransaction | null = null;
    let newCustomerPoints: number | undefined;

    // Step 15: Loyalty points calculation (if customer selected)
    if (customer) {
      const pointsEarned = Math.floor(totals.grandTotal / DEFAULT_STORE_INFO.loyalty_rate);
      if (pointsEarned > 0) {
        const prevPoints = customer.loyalty_points || 0;
        newCustomerPoints = prevPoints + pointsEarned;

        loyaltyTx = {
          id: generateUUID(),
          idempotency_key: `loyalty-${saleId}`,
          customer_id: customer.id,
          sale_id: saleId,
          points_delta: pointsEarned,
          previous_points: prevPoints,
          new_points: newCustomerPoints,
          type: 'EARN',
          timestamp: now,
          sync_status: 'pending',
        };
      }
    }

    // Step 12: Receipt generation
    const receiptContent = {
      store: DEFAULT_STORE_INFO,
      sale: saleRecord,
      items: saleItemRecords,
      payments: paymentRecords,
      customer: customer ? { name: customer.name, phone: customer.phone, loyalty_points: newCustomerPoints } : null,
    };

    const receiptRecord: Receipt = {
      id: generateUUID(),
      sale_id: saleId,
      receipt_number: receiptNumber,
      content_json: JSON.stringify(receiptContent),
      printed_at: now,
      email_queued: emailReceipt,
      sms_queued: smsReceipt,
      email_recipient: emailRecipient,
      sms_recipient: smsRecipient,
      sync_status: 'pending',
      created_at: now,
    };

    // Atomic transaction across Dexie tables
    await db.transaction(
      'rw',
      [
        db.sales,
        db.saleItems,
        db.payments,
        db.shifts,
        db.customers,
        db.loyaltyTransactions,
        db.receipts,
        db.syncQueue,
      ],
      async () => {
        // 1. Save Sale & Items & Payments
        await db.sales.put(saleRecord);
        await db.saleItems.bulkPut(saleItemRecords);
        await db.payments.bulkPut(paymentRecords);

        // 2. Step 14: Update Shift totals
        const currentShift = await db.shifts.get(shift.id);
        if (currentShift) {
          const cashPortion = payments
            .filter(p => p.method === 'cash')
            .reduce((acc, p) => acc + p.amount_paid, 0) - changeAmount;
          const cardPortion = payments
            .filter(p => p.method === 'card')
            .reduce((acc, p) => acc + p.amount_paid, 0);
          const walletPortion = payments
            .filter(p => p.method === 'wallet')
            .reduce((acc, p) => acc + p.amount_paid, 0);
          const qrPortion = payments
            .filter(p => p.method === 'qr')
            .reduce((acc, p) => acc + p.amount_paid, 0);

          await db.shifts.update(shift.id, {
            total_sales: (currentShift.total_sales || 0) + totals.grandTotal,
            transaction_count: (currentShift.transaction_count || 0) + 1,
            cash_sales_total: (currentShift.cash_sales_total || 0) + Math.max(0, cashPortion),
            card_sales_total: (currentShift.card_sales_total || 0) + cardPortion,
            wallet_sales_total: (currentShift.wallet_sales_total || 0) + walletPortion,
            qr_sales_total: (currentShift.qr_sales_total || 0) + qrPortion,
          });
        }

        // 3. Step 15: Update Customer Loyalty points
        if (customer && loyaltyTx && newCustomerPoints !== undefined) {
          await db.customers.update(customer.id, {
            loyalty_points: newCustomerPoints,
            updated_at: now,
          });
          await db.loyaltyTransactions.put(loyaltyTx);

          await db.syncQueue.add({
            entity_type: 'loyalty_transaction',
            entity_id: loyaltyTx.id,
            operation: 'INSERT',
            payload: JSON.stringify(loyaltyTx),
            idempotency_key: loyaltyTx.idempotency_key,
            attempts: 0,
            max_attempts: 10,
            status: 'pending',
            created_at: now,
          });
        }

        // 4. Save Receipt
        await db.receipts.put(receiptRecord);

        // 5. Enqueue Sale to Sync Queue
        await db.syncQueue.add({
          entity_type: 'sale',
          entity_id: saleId,
          operation: 'INSERT',
          payload: JSON.stringify({
            sale: saleRecord,
            items: saleItemRecords,
            payments: paymentRecords,
          }),
          idempotency_key: idempotencyKey,
          attempts: 0,
          max_attempts: 10,
          status: 'pending',
          created_at: now,
        });

        // 6. Enqueue Receipt to Sync Queue
        await db.syncQueue.add({
          entity_type: 'receipt',
          entity_id: receiptRecord.id,
          operation: 'INSERT',
          payload: JSON.stringify(receiptRecord),
          idempotency_key: `receipt-${receiptRecord.id}`,
          attempts: 0,
          max_attempts: 10,
          status: 'pending',
          created_at: now,
        });
      }
    );

    // Step 13: Decrement Inventory immediately
    await inventoryService.decrementStockForSale(
      items,
      saleId,
      shift.id,
      registerId,
      cashierId
    );

    return {
      sale: saleRecord,
      items: saleItemRecords,
      payments: paymentRecords,
      receipt: receiptRecord,
      loyaltyTransaction: loyaltyTx,
      newCustomerPoints,
    };
  }
}

export const saleService = new SaleService();
