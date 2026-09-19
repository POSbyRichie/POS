import { PosDatabase, db as defaultDb } from '../db/database';
import { Receipt, Sale, SaleItem, PaymentRecord, StoreInfo } from '../types';
import { printService } from './printService';
import { notificationQueueService } from './notificationQueueService';
import { DEFAULT_STORE_INFO } from '../utils/money';
import { logger } from '../utils/logger';

export interface ParsedReceiptData {
  store: StoreInfo;
  sale: Sale;
  items: SaleItem[];
  payments: PaymentRecord[];
  customer: { name: string; phone?: string; loyalty_points?: number } | null;
}

export class ReceiptService {
  /**
   * Safe parser for serialized receipt content
   */
  public parseReceiptContent(receipt: Receipt): ParsedReceiptData {
    try {
      const parsed = JSON.parse(receipt.content_json);
      return {
        store: parsed.store || DEFAULT_STORE_INFO,
        sale: parsed.sale,
        items: parsed.items || [],
        payments: parsed.payments || [],
        customer: parsed.customer || null,
      };
    } catch {
      throw new Error(`Corrupted receipt content JSON for receipt ID: ${receipt.id}`);
    }
  }

  /**
   * Get receipt by primary key ID
   */
  public async getReceiptById(id: string, database: PosDatabase = defaultDb): Promise<Receipt | null> {
    return (await database.receipts.get(id)) || null;
  }

  /**
   * Look up a receipt by its unique human-readable receipt number (e.g. CR-01-20260919-000001)
   */
  public async getReceiptByNumber(
    receiptNumber: string,
    database: PosDatabase = defaultDb
  ): Promise<Receipt | null> {
    return (
      (await database.receipts.where('receipt_number').equals(receiptNumber.trim()).first()) || null
    );
  }

  /**
   * Look up a receipt associated with a specific sale ID
   */
  public async getReceiptBySaleId(
    saleId: string,
    database: PosDatabase = defaultDb
  ): Promise<Receipt | null> {
    return (await database.receipts.where('sale_id').equals(saleId).first()) || null;
  }

  /**
   * List recent receipts with optional search filtering by receipt number or date
   */
  public async listReceipts(
    options: { search?: string; limit?: number } = {},
    database: PosDatabase = defaultDb
  ): Promise<Receipt[]> {
    const limit = options.limit || 50;
    let collection = database.receipts.orderBy('created_at').reverse();

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      const all = await collection.toArray();
      return all
        .filter(r => {
          if (r.receipt_number.toLowerCase().includes(q)) return true;
          if (r.email_recipient && r.email_recipient.toLowerCase().includes(q)) return true;
          if (r.sms_recipient && r.sms_recipient.includes(q)) return true;
          return false;
        })
        .slice(0, limit);
    }

    return collection.limit(limit).toArray();
  }

  /**
   * Reprint a receipt:
   * 1. Increments reprint_count and updates reprinted_at
   * 2. Adds an immutable audit log record (RECEIPT_REPRINTED)
   * 3. Formats thermal output with *** DUPLICATE / REPRINT *** banner
   */
  public async reprintReceipt(
    receiptId: string,
    cashierId: string,
    cashierName: string,
    database: PosDatabase = defaultDb
  ): Promise<{ receipt: Receipt; printText: string }> {
    const receipt = await database.receipts.get(receiptId);
    if (!receipt) {
      throw new Error(`Receipt with ID ${receiptId} not found`);
    }

    const now = new Date().toISOString();
    const newReprintCount = (receipt.reprint_count || 0) + 1;

    const updatedReceipt: Receipt = {
      ...receipt,
      reprint_count: newReprintCount,
      reprinted_at: now,
      is_reprint: true,
    };

    // Atomic update of receipt and audit log
    await database.transaction('rw', [database.receipts, database.auditLogs], async () => {
      await database.receipts.put(updatedReceipt);

      await database.auditLogs.add({
        user_id: cashierId,
        action: 'RECEIPT_REPRINTED',
        entity_type: 'receipt',
        entity_id: receipt.id,
        details: JSON.stringify({
          receipt_number: receipt.receipt_number,
          sale_id: receipt.sale_id,
          reprint_count: newReprintCount,
          reprinted_by: cashierName,
          timestamp: now,
        }),
        timestamp: now,
        sync_status: 'pending',
      });
    });

    const parsed = this.parseReceiptContent(updatedReceipt);
    const printText = printService.generateRawThermalReceipt(updatedReceipt, parsed.store, {
      isReprint: true,
      reprintCount: newReprintCount,
      reprintedAt: now,
      reprintedBy: cashierName,
    });

    logger.info(
      'ReceiptService',
      `Receipt ${receipt.receipt_number} reprinted (Count: ${newReprintCount}) by ${cashierName}`
    );

    return {
      receipt: updatedReceipt,
      printText,
    };
  }

  /**
   * Enqueue email for a previously generated receipt
   */
  public async queueEmailForReceipt(
    receiptId: string,
    email: string,
    customerName?: string,
    database: PosDatabase = defaultDb
  ): Promise<void> {
    const receipt = await database.receipts.get(receiptId);
    if (!receipt) throw new Error(`Receipt not found: ${receiptId}`);

    await notificationQueueService.queueEmail(
      {
        receiptId: receipt.id,
        saleId: receipt.sale_id,
        receiptNumber: receipt.receipt_number,
        recipientEmail: email,
        customerName,
      },
      database
    );

    await database.receipts.update(receipt.id, {
      email_queued: true,
      email_recipient: email,
    });
  }

  /**
   * Enqueue SMS for a previously generated receipt
   */
  public async queueSmsForReceipt(
    receiptId: string,
    phone: string,
    customerName?: string,
    database: PosDatabase = defaultDb
  ): Promise<void> {
    const receipt = await database.receipts.get(receiptId);
    if (!receipt) throw new Error(`Receipt not found: ${receiptId}`);

    await notificationQueueService.queueSms(
      {
        receiptId: receipt.id,
        saleId: receipt.sale_id,
        receiptNumber: receipt.receipt_number,
        phoneNumber: phone,
        customerName,
      },
      database
    );

    await database.receipts.update(receipt.id, {
      sms_queued: true,
      sms_recipient: phone,
    });
  }
}

export const receiptService = new ReceiptService();
