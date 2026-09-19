import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import {
  Sale,
  SaleItem,
  PaymentRecord,
  Receipt,
  LoyaltyTransaction,
  InventoryMovement,
  Customer,
  Shift,
  CartItem,
  PaymentBreakdown,
  PaymentMethod,
} from '../../types';
import { generateUUID } from '../../utils/id';
import { calculateCartTotals, DEFAULT_STORE_INFO } from '../../utils/money';
import { receiptNumberService } from '../../services/receiptNumberService';

export interface CreateSaleTransactionParams {
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

export interface CreateSaleTransactionResult {
  sale: Sale;
  items: SaleItem[];
  payments: PaymentRecord[];
  receipt: Receipt;
  movements: InventoryMovement[];
  loyaltyTransaction?: LoyaltyTransaction | null;
  newCustomerPoints?: number;
}

export class SalesRepository extends BaseRepository<Sale, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.sales);
  }

  /**
   * Primary ACID Checkout Transaction:
   * Executes multi-entity POS sale commit atomically inside IndexedDB.
   * Treats IndexedDB as the primary transactional system of record.
   */
  async createSaleTransaction(
    params: CreateSaleTransactionParams
  ): Promise<CreateSaleTransactionResult> {
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
    const { receiptNumber } = await receiptNumberService.generateReceiptNumber(this.db, { registerId });
    const now = new Date().toISOString();

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
      reprint_count: 0,
      email_queued: Boolean(emailReceipt),
      sms_queued: Boolean(smsReceipt),
      email_recipient: emailRecipient,
      sms_recipient: smsRecipient,
      sync_status: 'pending',
      created_at: now,
    };

    const movementRecords: InventoryMovement[] = [];

    // Execute atomic transaction across all primary entity tables in IndexedDB
    await this.db.transaction(
      'rw',
      [
        this.db.sales,
        this.db.saleItems,
        this.db.payments,
        this.db.shifts,
        this.db.customers,
        this.db.loyaltyTransactions,
        this.db.receipts,
        this.db.products,
        this.db.inventoryMovements,
        this.db.syncQueue,
        this.db.auditLogs,
        this.db.emailQueue,
        this.db.smsQueue,
      ],
      async () => {
        // 1. Insert Sale & Line Items & Payments
        await this.db.sales.put(saleRecord);
        await this.db.saleItems.bulkPut(saleItemRecords);
        await this.db.payments.bulkPut(paymentRecords);

        // 2. Decrement product stock & log immutable inventory movements
        for (const item of items) {
          const product = await this.db.products.get(item.product.id);
          if (product) {
            const previousQuantity = product.stock_quantity;
            const soldQty = item.quantity;
            const newQuantity = previousQuantity - soldQty;

            await this.db.products.update(product.id, {
              stock_quantity: newQuantity,
              updated_at: now,
            });

            const movement: InventoryMovement = {
              id: generateUUID(),
              idempotency_key: `inv-sale-${saleId}-${item.product.id}`,
              product_id: product.id,
              register_id: registerId,
              shift_id: shift.id,
              type: 'SALE',
              quantity_delta: -soldQty,
              previous_quantity: previousQuantity,
              new_quantity: newQuantity,
              reference_id: saleId,
              user_id: cashierId,
              notes: `Sold in Sale #${receiptNumber}`,
              timestamp: now,
              sync_status: 'pending',
            };

            await this.db.inventoryMovements.put(movement);
            movementRecords.push(movement);

            // Enqueue inventory movement to sync queue
            await this.db.syncQueue.add({
              entity_type: 'inventory_movement',
              entity_id: movement.id,
              operation: 'INSERT',
              payload: JSON.stringify(movement),
              idempotency_key: movement.idempotency_key,
              attempts: 0,
              max_attempts: 10,
              status: 'pending',
              created_at: now,
            });
          }
        }

        // 3. Update Shift aggregates
        const currentShift = await this.db.shifts.get(shift.id);
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

          await this.db.shifts.update(shift.id, {
            total_sales: (currentShift.total_sales || 0) + totals.grandTotal,
            transaction_count: (currentShift.transaction_count || 0) + 1,
            cash_sales_total: (currentShift.cash_sales_total || 0) + Math.max(0, cashPortion),
            card_sales_total: (currentShift.card_sales_total || 0) + cardPortion,
            wallet_sales_total: (currentShift.wallet_sales_total || 0) + walletPortion,
            qr_sales_total: (currentShift.qr_sales_total || 0) + qrPortion,
          });
        }

        // 4. Update Customer Loyalty points
        if (customer && loyaltyTx && newCustomerPoints !== undefined) {
          await this.db.customers.update(customer.id, {
            loyalty_points: newCustomerPoints,
            updated_at: now,
          });
          await this.db.loyaltyTransactions.put(loyaltyTx);

          await this.db.syncQueue.add({
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

        // 5. Store Receipt
        await this.db.receipts.put(receiptRecord);

        // 6. Enqueue Sale payload to Sync Queue
        await this.db.syncQueue.add({
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

        // 7. Enqueue Receipt to Sync Queue
        await this.db.syncQueue.add({
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

        // 8. Immutable Audit Log
        await this.db.auditLogs.add({
          user_id: cashierId,
          action: 'SALE_COMPLETED',
          entity_type: 'sale',
          entity_id: saleId,
          details: `Receipt #${receiptNumber}, Total: ${totals.grandTotal}`,
          timestamp: now,
          sync_status: 'pending',
        });

        // 9. Enqueue Email if requested
        if (emailReceipt && emailRecipient) {
          await this.db.emailQueue.put({
            id: generateUUID(),
            receipt_id: receiptRecord.id,
            sale_id: saleId,
            receipt_number: receiptNumber,
            recipient_email: emailRecipient.trim().toLowerCase(),
            customer_name: customer?.name,
            subject: `Your Receipt from Antigravity POS (${receiptNumber})`,
            html_body: `<p>Thank you for your purchase! Receipt: <strong>${receiptNumber}</strong></p>`,
            status: 'queued',
            attempts: 0,
            max_attempts: 3,
            created_at: now,
          });
        }

        // 10. Enqueue SMS if requested
        if (smsReceipt && smsRecipient) {
          await this.db.smsQueue.put({
            id: generateUUID(),
            receipt_id: receiptRecord.id,
            sale_id: saleId,
            receipt_number: receiptNumber,
            phone_number: smsRecipient.trim(),
            customer_name: customer?.name,
            message_text: `Antigravity POS: Receipt ${receiptNumber} confirmed. Total: ${totals.grandTotal}. Thank you!`,
            status: 'queued',
            attempts: 0,
            max_attempts: 3,
            created_at: now,
          });
        }
      }
    );

    return {
      sale: saleRecord,
      items: saleItemRecords,
      payments: paymentRecords,
      receipt: receiptRecord,
      movements: movementRecords,
      loyaltyTransaction: loyaltyTx,
      newCustomerPoints,
    };
  }

  async getWithDetails(saleId: string) {
    const sale = await this.get(saleId);
    if (!sale) return null;

    const [items, payments, receipt] = await Promise.all([
      this.db.saleItems.where('sale_id').equals(saleId).toArray(),
      this.db.payments.where('sale_id').equals(saleId).toArray(),
      this.db.receipts.where('sale_id').equals(saleId).first(),
    ]);

    const customer = sale.customer_id ? await this.db.customers.get(sale.customer_id) : null;

    return {
      sale,
      items,
      payments,
      receipt,
      customer,
    };
  }

  async getByShift(shiftId: string): Promise<Sale[]> {
    return this.db.sales.where('shift_id').equals(shiftId).toArray();
  }

  async getByReceiptNumber(receiptNumber: string): Promise<Sale | undefined> {
    return this.db.sales.where('receipt_number').equals(receiptNumber).first();
  }
}
