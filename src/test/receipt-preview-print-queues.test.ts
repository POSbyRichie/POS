import { describe, it, expect, beforeEach } from 'vitest';
import { PosDatabase } from '../db/database';
import { receiptNumberService } from '../services/receiptNumberService';
import { receiptService } from '../services/receiptService';
import { printService } from '../services/printService';
import { notificationQueueService } from '../services/notificationQueueService';
import { SalesRepository } from '../db/repositories/salesRepository';
import { generateUUID } from '../utils/id';
import { DEFAULT_STORE_INFO } from '../utils/money';
import { Shift, Product, Register, Customer } from '../types';

describe('Receipt Preview, Print, Reprint, Queues & Numbering Subsystem', () => {
  let testDb: PosDatabase;
  let salesRepo: SalesRepository;
  let testRegister1: Register;
  let testRegister2: Register;
  let testShift: Shift;
  let testProduct: Product;
  let testCustomer: Customer;

  beforeEach(async () => {
    const dbName = `test-pos-receipts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    testDb = new PosDatabase(dbName);
    salesRepo = new SalesRepository(testDb);

    testRegister1 = {
      id: 'reg-001-main',
      register_name: 'Register 01 (Main Counter)',
      branch_name: 'Downtown Store',
      is_active: true,
    };

    testRegister2 = {
      id: 'reg-002-bakery',
      register_name: 'Register 02 (Bakery Station)',
      branch_name: 'Downtown Store',
      is_active: true,
    };

    await testDb.registers.bulkPut([testRegister1, testRegister2]);

    testShift = {
      id: 'shift-rec-01',
      idempotency_key: 'shift-rec-idemp-01',
      register_id: testRegister1.id,
      cashier_id: 'cashier-01',
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
    await testDb.shifts.put(testShift);

    testProduct = {
      id: 'prod-milk-01',
      sku: 'MILK-001',
      barcode: '600123456789',
      name: 'Fresh Dairy Milk 1L',
      category_id: 'cat-groceries',
      cost_price: 2500,
      selling_price: 3500,
      tax_rate: 18,
      unit: 'pcs',
      stock_quantity: 100,
      min_stock_level: 10,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.products.put(testProduct);

    testCustomer = {
      id: 'cust-john-01',
      name: 'John Doe',
      phone: '+256700112233',
      email: 'john.doe@example.com',
      loyalty_points: 150,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await testDb.customers.put(testCustomer);
  });

  describe('1. Multi-Register Offline-Safe Receipt Numbering', () => {
    it('correctly derives canonical register partition codes', () => {
      expect(receiptNumberService.getRegisterCode('reg-001-main', 'Register 01 (Main Counter)')).toBe('01');
      expect(receiptNumberService.getRegisterCode('reg-002-bakery', 'Register 02 (Bakery Station)')).toBe('02');
      expect(receiptNumberService.getRegisterCode('station-3', 'POS Station 3')).toBe('03');
    });

    it('generates unique, non-colliding receipt numbers across two offline registers on the same date', async () => {
      const today = new Date('2026-09-19T10:00:00Z');

      // Register 1 generates sequence 1, 2, 3
      const r1_1 = await receiptNumberService.generateReceiptNumber(testDb, {
        registerId: testRegister1.id,
        date: today,
      });
      const r1_2 = await receiptNumberService.generateReceiptNumber(testDb, {
        registerId: testRegister1.id,
        date: today,
      });
      const r1_3 = await receiptNumberService.generateReceiptNumber(testDb, {
        registerId: testRegister1.id,
        date: today,
      });

      // Register 2 generates sequence 1, 2, 3 concurrently offline
      const r2_1 = await receiptNumberService.generateReceiptNumber(testDb, {
        registerId: testRegister2.id,
        date: today,
      });
      const r2_2 = await receiptNumberService.generateReceiptNumber(testDb, {
        registerId: testRegister2.id,
        date: today,
      });

      // Verify Register 1 sequence
      expect(r1_1.receiptNumber).toBe('CR-01-20260919-000001');
      expect(r1_2.receiptNumber).toBe('CR-01-20260919-000002');
      expect(r1_3.receiptNumber).toBe('CR-01-20260919-000003');

      // Verify Register 2 sequence
      expect(r2_1.receiptNumber).toBe('CR-02-20260919-000001');
      expect(r2_2.receiptNumber).toBe('CR-02-20260919-000002');

      // Zero collisions: every single receipt number across registers is strictly unique
      const allNumbers = [r1_1.receiptNumber, r1_2.receiptNumber, r1_3.receiptNumber, r2_1.receiptNumber, r2_2.receiptNumber];
      const uniqueNumbers = new Set(allNumbers);
      expect(uniqueNumbers.size).toBe(5);
    });

    it('supports partitioned 6-digit formatting (CR-YYYYMMDD-RRSSSS)', () => {
      const num1 = receiptNumberService.formatReceiptNumber('01', '20260919', 1, 'partitioned');
      const num2 = receiptNumberService.formatReceiptNumber('01', '20260919', 2, 'partitioned');
      const numR2 = receiptNumberService.formatReceiptNumber('02', '20260919', 1, 'partitioned');

      expect(num1).toBe('CR-20260919-010001');
      expect(num2).toBe('CR-20260919-010002');
      expect(numR2).toBe('CR-20260919-020001');
    });

    it('recovers sequence from high-water mark if settings counter is wiped or lagging', async () => {
      const today = new Date('2026-09-19T14:00:00Z');

      // Simulate existing sales in database up to sequence 4
      await testDb.sales.put({
        id: generateUUID(),
        idempotency_key: 'sale-mock-04',
        receipt_number: 'CR-01-20260919-000004',
        shift_id: testShift.id,
        register_id: testRegister1.id,
        cashier_id: 'c1',
        subtotal: 3500,
        discount_amount: 0,
        tax_amount: 533,
        total_amount: 3500,
        amount_paid: 3500,
        change_amount: 0,
        payment_method: 'cash',
        payment_status: 'paid',
        items_count: 1,
        sync_status: 'pending',
        created_at: today.toISOString(),
        updated_at: today.toISOString(),
      });

      // Clear the settings counter table to simulate storage flush or cache wipe
      await testDb.settings.clear();

      // Next generated number should automatically inspect existing sales and advance to 000005
      const result = await receiptNumberService.generateReceiptNumber(testDb, {
        registerId: testRegister1.id,
        date: today,
      });

      expect(result.sequence).toBe(5);
      expect(result.receiptNumber).toBe('CR-01-20260919-000005');
    });
  });

  describe('2. Thermal Printing & ESC/POS Generation', () => {
    it('generates raw thermal monospace receipt with store header, items, and totals', () => {
      const mockReceipt = {
        id: 'rec-001',
        sale_id: 'sale-001',
        receipt_number: 'CR-01-20260919-000001',
        content_json: JSON.stringify({
          store: DEFAULT_STORE_INFO,
          sale: {
            receipt_number: 'CR-01-20260919-000001',
            created_at: '2026-09-19T10:00:00Z',
            cashier_id: 'cashier-01',
            register_id: 'reg-001',
            subtotal: 7000,
            discount_amount: 500,
            tax_amount: 991,
            total_amount: 6500,
            amount_paid: 10000,
            change_amount: 3500,
          },
          items: [
            {
              product_name: 'Fresh Dairy Milk 1L',
              quantity: 2,
              unit_price: 3500,
              total_price: 7000,
            },
          ],
          payments: [
            {
              method: 'cash',
              amount_paid: 10000,
            },
          ],
        }),
        reprint_count: 0,
        email_queued: false,
        sms_queued: false,
        sync_status: 'pending' as const,
        created_at: '2026-09-19T10:00:00Z',
      };

      const thermalOutput = printService.generateRawThermalReceipt(mockReceipt, DEFAULT_STORE_INFO, {
        width: 48,
      });

      expect(thermalOutput).toContain('RECEIPT: CR-01-20260919-000001');
      expect(thermalOutput).toContain('Fresh Dairy Milk 1L');
      expect(thermalOutput).toContain('TOTAL DUE:');
      expect(thermalOutput).toContain('PAID (CASH):');
      expect(thermalOutput).toContain('CHANGE GIVEN:');
      expect(thermalOutput).toContain('THANK YOU FOR YOUR BUSINESS!');
      // Original receipt does not contain duplicate banner
      expect(thermalOutput).not.toContain('*** DUPLICATE / REPRINT ***');
    });

    it('generates binary ESC/POS byte buffers with init command and paper cut opcode', () => {
      const mockReceipt = {
        id: 'rec-002',
        sale_id: 'sale-002',
        receipt_number: 'CR-01-20260919-000002',
        content_json: JSON.stringify({
          sale: {
            receipt_number: 'CR-01-20260919-000002',
            created_at: '2026-09-19T10:00:00Z',
            cashier_id: 'cashier-01',
            register_id: 'reg-001',
            subtotal: 3500,
            discount_amount: 0,
            tax_amount: 533,
            total_amount: 3500,
            amount_paid: 3500,
            change_amount: 0,
          },
          items: [],
          payments: [],
        }),
        reprint_count: 0,
        email_queued: false,
        sms_queued: false,
        sync_status: 'pending' as const,
        created_at: '2026-09-19T10:00:00Z',
      };

      const bytes = printService.generateEscPosBytes(mockReceipt, DEFAULT_STORE_INFO);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(50);

      // Verify ESC @ (0x1B, 0x40) at start
      expect(bytes[0]).toBe(0x1b);
      expect(bytes[1]).toBe(0x40);

      // Verify GS V 66 0 (0x1D, 0x56, 0x42, 0x00) cut command at end
      const len = bytes.length;
      expect(bytes[len - 4]).toBe(0x1d);
      expect(bytes[len - 3]).toBe(0x56);
      expect(bytes[len - 2]).toBe(0x42);
      expect(bytes[len - 1]).toBe(0x00);
    });
  });

  describe('3. Audit-Logged Reprint Lifecycle & Duplicate Watermarking', () => {
    it('increments reprint counter, logs audit trail, and watermarks reprint receipt', async () => {
      // 1. Create a base sale and receipt
      const saleResult = await salesRepo.createSaleTransaction({
        items: [{ product: testProduct, quantity: 1, unit_price: 3500, tax_rate: 0, discount_amount: 0, item_total: 3500 }],
        payments: [{ id: 'p1', method: 'cash', amount_paid: 3500 }],
        shift: testShift,
        registerId: testRegister1.id,
        cashierId: 'cashier-alice',
      });

      expect(saleResult.receipt.reprint_count).toBe(0);
      expect(saleResult.receipt.is_reprint).toBeFalsy();

      // 2. Perform 1st reprint
      const reprint1 = await receiptService.reprintReceipt(
        saleResult.receipt.id,
        'cashier-alice',
        'Alice Cashier',
        testDb
      );

      expect(reprint1.receipt.reprint_count).toBe(1);
      expect(reprint1.receipt.is_reprint).toBe(true);
      expect(reprint1.receipt.reprinted_at).toBeDefined();
      expect(reprint1.printText).toContain('*** DUPLICATE / REPRINT ***');
      expect(reprint1.printText).toContain('REPRINT #1');

      // 3. Verify audit log entry was written to IndexedDB
      const auditLogs = await testDb.auditLogs.where('action').equals('RECEIPT_REPRINTED').toArray();
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].entity_id).toBe(saleResult.receipt.id);
      expect(auditLogs[0].user_id).toBe('cashier-alice');

      const details = JSON.parse(auditLogs[0].details || '{}');
      expect(details.reprint_count).toBe(1);
      expect(details.reprinted_by).toBe('Alice Cashier');

      // 4. Perform 2nd reprint
      const reprint2 = await receiptService.reprintReceipt(
        saleResult.receipt.id,
        'cashier-bob',
        'Bob Supervisor',
        testDb
      );

      expect(reprint2.receipt.reprint_count).toBe(2);
      expect(reprint2.printText).toContain('REPRINT #2');
      expect(reprint2.printText).toContain('BY: Bob Supervisor');

      const auditLogsAfter = await testDb.auditLogs.where('action').equals('RECEIPT_REPRINTED').toArray();
      expect(auditLogsAfter.length).toBe(2);
    });
  });

  describe('4. Offline-First Email & SMS Notification Queues', () => {
    it('enqueues email and SMS jobs offline in IndexedDB', async () => {
      const emailItem = await notificationQueueService.queueEmail(
        {
          receiptId: 'rec-009',
          saleId: 'sale-009',
          receiptNumber: 'CR-01-20260919-000009',
          recipientEmail: 'client@example.com',
          customerName: 'Mary Jane',
        },
        testDb
      );

      const smsItem = await notificationQueueService.queueSms(
        {
          receiptId: 'rec-009',
          saleId: 'sale-009',
          receiptNumber: 'CR-01-20260919-000009',
          phoneNumber: '+256772123456',
          customerName: 'Mary Jane',
        },
        testDb
      );

      expect(emailItem.status).toBe('queued');
      expect(emailItem.recipient_email).toBe('client@example.com');
      expect(smsItem.status).toBe('queued');
      expect(smsItem.phone_number).toBe('+256772123456');

      const storedEmail = await testDb.emailQueue.get(emailItem.id);
      const storedSms = await testDb.smsQueue.get(smsItem.id);

      expect(storedEmail).toBeDefined();
      expect(storedSms).toBeDefined();
    });

    it('processes queued items, marks them sent, and tracks queue statistics', async () => {
      await notificationQueueService.queueEmail(
        {
          receiptId: 'rec-010',
          saleId: 'sale-010',
          receiptNumber: 'CR-01-20260919-000010',
          recipientEmail: 'success@store.com',
        },
        testDb
      );

      await notificationQueueService.queueSms(
        {
          receiptId: 'rec-010',
          saleId: 'sale-010',
          receiptNumber: 'CR-01-20260919-000010',
          phoneNumber: '+256701987654',
        },
        testDb
      );

      // Process queues
      const result = await notificationQueueService.processQueues(testDb);
      expect(result.emailProcessed).toBe(1);
      expect(result.smsProcessed).toBe(1);

      // Check statistics
      const stats = await notificationQueueService.getQueueStats(testDb);
      expect(stats.pendingEmails).toBe(0);
      expect(stats.sentEmails).toBe(1);
      expect(stats.pendingSms).toBe(0);
      expect(stats.sentSms).toBe(1);
    });

    it('handles dispatch failures gracefully and allows manual retry', async () => {
      // Queue invalid email
      const invalidEmail = await notificationQueueService.queueEmail(
        {
          receiptId: 'rec-bad',
          saleId: 'sale-bad',
          receiptNumber: 'CR-01-20260919-000011',
          recipientEmail: 'invalid-email-address-no-at-sign',
        },
        testDb
      );

      await notificationQueueService.processQueues(testDb);

      const failedItem = await testDb.emailQueue.get(invalidEmail.id);
      expect(failedItem?.attempts).toBe(1);
      expect(failedItem?.error_message).toContain('Invalid email');

      // Manual retry
      await notificationQueueService.retryQueueItem('email', invalidEmail.id, testDb);
      const retriedItem = await testDb.emailQueue.get(invalidEmail.id);
      expect(retriedItem?.status).toBe('queued');
      expect(retriedItem?.error_message).toBeUndefined();
    });
  });

  describe('5. End-to-End Sale Integration with Numbering and Digital Queuing', () => {
    it('executes checkout with automated offline receipt numbering and atomic email/sms queueing', async () => {
      const result = await salesRepo.createSaleTransaction({
        items: [
          {
            product: testProduct,
            quantity: 2,
            unit_price: 3500,
            tax_rate: 0,
            discount_amount: 0,
            item_total: 7000,
          },
        ],
        payments: [{ id: 'p-cash', method: 'cash', amount_paid: 7000 }],
        customer: testCustomer,
        shift: testShift,
        registerId: testRegister1.id,
        cashierId: 'cashier-01',
        emailReceipt: true,
        emailRecipient: 'customer@buyer.com',
        smsReceipt: true,
        smsRecipient: '+256700998877',
      });

      // Verify receipt number structure
      expect(result.receipt.receipt_number).toMatch(/^CR-01-\d{8}-\d{6}$/);
      expect(result.sale.receipt_number).toBe(result.receipt.receipt_number);

      // Verify email & SMS were queued inside IndexedDB transaction
      const emailEntries = await testDb.emailQueue.where('receipt_id').equals(result.receipt.id).toArray();
      const smsEntries = await testDb.smsQueue.where('receipt_id').equals(result.receipt.id).toArray();

      expect(emailEntries.length).toBe(1);
      expect(emailEntries[0].recipient_email).toBe('customer@buyer.com');
      expect(emailEntries[0].status).toBe('queued');

      expect(smsEntries.length).toBe(1);
      expect(smsEntries[0].phone_number).toBe('+256700998877');
      expect(smsEntries[0].status).toBe('queued');
    });
  });
});
