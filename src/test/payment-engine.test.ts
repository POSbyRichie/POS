import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { seedDatabase } from '../db/seed';
import { posStore } from '../store/posStore';
import {
  paymentEngine,
  cashPaymentStrategy,
  cardPaymentStrategy,
  walletPaymentStrategy,
  qrPaymentStrategy,
  splitPaymentStrategy,
  PaymentProcessRequest,
  TenderLineItem,
} from '../payment';
import { Shift, CartItem, User, Register, Product } from '../types';
import { generateUUID } from '../utils/id';

describe('Modular Payment Engine & Decision Lifecycle Test Suite', () => {
  let mockCashier: User;
  let mockRegister: Register;
  let mockShift: Shift;
  let mockProduct: Product;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedDatabase(true);

    const cashierUser = await db.users.where('role').equals('cashier').first();
    const reg = await db.registers.get('reg-001-main');
    const prod = await db.products.where('sku').equals('GRO-001').first();

    mockCashier = cashierUser!;
    mockRegister = reg!;
    mockProduct = prod!;

    mockShift = {
      id: generateUUID(),
      idempotency_key: `shift-test-${Date.now()}`,
      register_id: mockRegister.id,
      cashier_id: mockCashier.id,
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
    await db.shifts.put(mockShift);

    posStore.setState({
      currentUser: mockCashier,
      activeRegister: mockRegister,
      activeShift: mockShift,
      cartItems: [
        {
          product: mockProduct,
          quantity: 1,
          unit_price: 40000,
          discount_amount: 0,
          tax_rate: 0,
          item_total: 40000,
        },
      ],
      activeWorkflowStep: 10,
    });
  });

  const createRequest = (totalDue: number, tenders: TenderLineItem[]): PaymentProcessRequest => {
    const items: CartItem[] = [
      {
        product: { ...mockProduct, selling_price: totalDue },
        quantity: 1,
        unit_price: totalDue,
        discount_amount: 0,
        tax_rate: 0,
        item_total: totalDue,
      },
    ];
    return {
      saleId: generateUUID(),
      totalDue,
      items,
      tenders,
      shift: mockShift,
      registerId: mockRegister.id,
      cashierId: mockCashier.id,
    };
  };

  // ===========================================================================
  // 1. CASH STRATEGY TESTS
  // ===========================================================================
  describe('Cash Payment Strategy', () => {
    it('successfully processes exact cash payment', async () => {
      const totalDue = 40000;
      const tender = paymentEngine.createTender('cash', 40000);
      const request = createRequest(totalDue, [tender]);

      const result = await cashPaymentStrategy.process(request, tender);
      if (!result.success) console.error('Cash process failure:', result.errorCode, result.errorMessage);

      expect(result.success).toBe(true);
      expect(result.status).toBe('successful');
      expect(result.change).toBe(0);
      expect(result.tenders[0].cashMetadata?.cashDrawerOpenTriggered).toBe(true);
      expect(result.saleResult).toBeDefined();
    });

    it('calculates change accurately on cash overpayment', async () => {
      const totalDue = 35000;
      const tender = paymentEngine.createTender('cash', 50000); // 50k tendered
      const request = createRequest(totalDue, [tender]);

      const result = await cashPaymentStrategy.process(request, tender);

      expect(result.success).toBe(true);
      expect(result.change).toBe(15000);
      expect(result.tenders[0].cashMetadata?.changeGiven).toBe(15000);
      expect(result.tenders[0].cashMetadata?.tenderedAmount).toBe(50000);
    });

    it('rejects cash underpayment with INSUFFICIENT_CASH code', async () => {
      const totalDue = 40000;
      const tender = paymentEngine.createTender('cash', 25000); // Short by 15k
      const request = createRequest(totalDue, [tender]);

      const result = await cashPaymentStrategy.process(request, tender);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('INSUFFICIENT_CASH');
      expect(result.canRetry).toBe(true);
    });
  });

  // ===========================================================================
  // 2. CARD STRATEGY TESTS
  // ===========================================================================
  describe('Card Payment Strategy', () => {
    it('processes card payment with valid terminal auth code', async () => {
      const totalDue = 40000;
      const tender = paymentEngine.createTender('card', 40000, 'AUTH-123456', {
        brand: 'visa',
        last4: '4242',
      });
      const request = createRequest(totalDue, [tender]);

      const result = await cardPaymentStrategy.process(request, tender);

      expect(result.success).toBe(true);
      expect(result.status).toBe('successful');
      expect(result.tenders[0].cardMetadata?.authCode).toBe('AUTH-123456');
      expect(result.tenders[0].cardMetadata?.isOfflineAuthorized).toBe(true);
    });

    it('rejects card payment with missing authorization reference', async () => {
      const totalDue = 40000;
      const tender = paymentEngine.createTender('card', 40000, ''); // Missing auth
      const request = createRequest(totalDue, [tender]);

      const result = await cardPaymentStrategy.process(request, tender);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_CARD_AUTH');
      expect(result.canRetry).toBe(true);
    });
  });

  // ===========================================================================
  // 3. WALLET STRATEGY TESTS
  // ===========================================================================
  describe('Mobile Wallet Strategy', () => {
    it('processes Mobile Money payment with carrier and transaction reference', async () => {
      const totalDue = 25000;
      const tender = paymentEngine.createTender('wallet', 25000, 'TXN-MOMO-998877', {
        carrier: 'mtn_momo',
        phoneNumber: '+256772000000',
      });
      const request = createRequest(totalDue, [tender]);

      const result = await walletPaymentStrategy.process(request, tender);

      expect(result.success).toBe(true);
      expect(result.status).toBe('successful');
      expect(result.tenders[0].walletMetadata?.carrier).toBe('mtn_momo');
      expect(result.tenders[0].walletMetadata?.transactionReference).toBe('TXN-MOMO-998877');
    });

    it('rejects wallet tender when transaction reference is missing', async () => {
      const totalDue = 25000;
      const tender = paymentEngine.createTender('wallet', 25000, '');
      const request = createRequest(totalDue, [tender]);

      const result = await walletPaymentStrategy.process(request, tender);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_WALLET_REFERENCE');
    });
  });

  // ===========================================================================
  // 4. QR STRATEGY TESTS
  // ===========================================================================
  describe('QR Payment Strategy', () => {
    it('generates merchant EMVCo payload and verifies QR scan confirmation', async () => {
      const totalDue = 30000;
      const tender = paymentEngine.createTender('qr', 30000, 'QR-CONFIRM-5544');
      const request = createRequest(totalDue, [tender]);

      const result = await qrPaymentStrategy.process(request, tender);

      expect(result.success).toBe(true);
      expect(result.status).toBe('successful');
      expect(result.tenders[0].qrMetadata?.qrPayload).toContain('POSQR');
      expect(result.tenders[0].qrMetadata?.transactionReference).toBe('QR-CONFIRM-5544');
    });

    it('rejects QR tender without scan confirmation', async () => {
      const totalDue = 30000;
      const tender = paymentEngine.createTender('qr', 30000, '');
      const request = createRequest(totalDue, [tender]);

      const result = await qrPaymentStrategy.process(request, tender);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_QR_CONFIRMATION');
    });
  });

  // ===========================================================================
  // 5. SPLIT PAYMENT STRATEGY TESTS
  // ===========================================================================
  describe('Split Payment Strategy', () => {
    it('coordinates multi-tender split across Cash, Card, and Wallet', async () => {
      const totalDue = 50000;
      const tender1 = paymentEngine.createTender('cash', 20000);
      const tender2 = paymentEngine.createTender('card', 20000, 'AUTH-SPLIT-01');
      const tender3 = paymentEngine.createTender('wallet', 10000, 'TXN-SPLIT-02');

      const request = createRequest(totalDue, [tender1, tender2, tender3]);
      const result = await splitPaymentStrategy.process(request);

      expect(result.success).toBe(true);
      expect(result.status).toBe('successful');
      expect(result.totalPaid).toBe(50000);
      expect(result.change).toBe(0);
      expect(result.tenders).toHaveLength(3);
    });

    it('allocates change properly to cash portion in split payment', async () => {
      const totalDue = 45000;
      const tender1 = paymentEngine.createTender('card', 25000, 'AUTH-01');
      const tender2 = paymentEngine.createTender('cash', 30000); // 25k + 30k = 55k total (10k change)

      const request = createRequest(totalDue, [tender1, tender2]);
      const result = await splitPaymentStrategy.process(request);

      expect(result.success).toBe(true);
      expect(result.totalPaid).toBe(55000);
      expect(result.change).toBe(10000);
      expect(result.tenders[1].cashMetadata?.changeGiven).toBe(10000);
    });

    it('rejects split payment when sum of tenders is less than total due', async () => {
      const totalDue = 50000;
      const tender1 = paymentEngine.createTender('cash', 20000);
      const tender2 = paymentEngine.createTender('card', 15000, 'AUTH-02'); // Sum 35k < 50k

      const request = createRequest(totalDue, [tender1, tender2]);
      const result = await splitPaymentStrategy.process(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INSUFFICIENT_TOTAL_SPLIT');
      expect(result.errorMessage).toContain('Shortfall');
    });
  });

  // ===========================================================================
  // 6. PAYMENT DECISION LIFECYCLE TESTS (YES -> Receipt, NO -> Retry / Change / Cancel)
  // ===========================================================================
  describe('Payment Decision Lifecycle Handler', () => {
    it('Decision Branch YES: proceeds to Receipt and updates workflow to Step 12', async () => {
      const totalDue = 40000;
      const tender = paymentEngine.createTender('cash', 40000);
      const request = createRequest(totalDue, [tender]);

      const result = await paymentEngine.processWithDecision(request);

      expect(result.success).toBe(true);
      const decisionState = paymentEngine.decisionHandler.getState();
      expect(decisionState.status).toBe('successful');
      expect(posStore.getState().activeWorkflowStep).toBe(12); // Advanced to Receipt!
    });

    it('Decision Branch NO: handles failure, records diagnostics, and executes Retry', async () => {
      const totalDue = 40000;
      const failedTender = paymentEngine.createTender('cash', 10000); // Insufficient
      const request = createRequest(totalDue, [failedTender]);

      const result = await paymentEngine.processWithDecision(request);

      expect(result.success).toBe(false);
      const decisionState = paymentEngine.decisionHandler.getState();
      expect(decisionState.status).toBe('failed');
      expect(decisionState.errorCode).toBe('INSUFFICIENT_CASH');

      // Recovery Action: Retry
      const action = paymentEngine.decisionHandler.actionRetry();
      expect(action).toBe('retry');
      expect(paymentEngine.decisionHandler.getState().status).toBe('processing');

      // Retry with adjusted full tender
      const adjustedTender = paymentEngine.createTender('cash', 40000);
      const retryRequest = createRequest(totalDue, [adjustedTender]);
      const retryResult = await paymentEngine.processWithDecision(retryRequest);
      expect(retryResult.success).toBe(true);
      expect(posStore.getState().activeWorkflowStep).toBe(12);
    });

    it('Decision Branch NO: handles failure and executes Change Method', async () => {
      const totalDue = 40000;
      const failedCardTender = paymentEngine.createTender('card', 40000, ''); // Missing auth
      const request = createRequest(totalDue, [failedCardTender]);

      const result = await paymentEngine.processWithDecision(request);
      expect(result.success).toBe(false);

      // Recovery Action: Change Method to Cash
      const action = paymentEngine.decisionHandler.actionChangeMethod('cash');
      expect(action).toBe('change_method');
      expect(paymentEngine.decisionHandler.getState().activeMethod).toBe('cash');
      expect(paymentEngine.decisionHandler.getState().status).toBe('idle');

      // Process with newly selected Cash method
      const cashTender = paymentEngine.createTender('cash', 40000);
      const cashRequest = createRequest(totalDue, [cashTender]);
      const cashResult = await paymentEngine.processWithDecision(cashRequest);
      expect(cashResult.success).toBe(true);
      expect(posStore.getState().activeWorkflowStep).toBe(12);
    });

    it('Decision Branch NO: handles failure and executes Cancel (preserves cart & returns to Step 8)', async () => {
      const totalDue = 40000;
      const failedTender = paymentEngine.createTender('cash', 5000);
      const request = createRequest(totalDue, [failedTender]);

      posStore.setState({ activeWorkflowStep: 10, isPaymentModalOpen: true });
      const result = await paymentEngine.processWithDecision(request);
      expect(result.success).toBe(false);

      // Recovery Action: Cancel
      const action = paymentEngine.decisionHandler.actionCancel();
      expect(action).toBe('cancel');
      expect(paymentEngine.decisionHandler.getState().status).toBe('cancelled');

      // Verifies posStore state: cart preserved, modal closed, returned to Step 8
      const storeState = posStore.getState();
      expect(storeState.cartItems).toHaveLength(1);
      expect(storeState.isPaymentModalOpen).toBe(false);
      expect(storeState.activeWorkflowStep).toBe(8);
    });
  });
});
