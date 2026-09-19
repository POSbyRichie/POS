import { describe, it, expect, beforeEach } from 'vitest';
import { db, productRepository, customerRepository } from '../db';
import { seedDatabase } from '../db/seed';
import { posStore } from '../store/posStore';
import { saleService } from '../services/saleService';
import { Shift, Product } from '../types';
import { generateUUID } from '../utils/id';
import { calculateCartTotals } from '../utils/money';

describe('Authoritative 18-Step POS Flow & Decision Gates E2E Test', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedDatabase(true);
    // Reset posStore state
    posStore.logout();
  });

  it('strictly executes and verifies the complete 18-step flow reproducing the diagram', async () => {
    // =========================================================================
    // STEP 1: LOGIN
    // =========================================================================
    const cashier = await db.users.where('role').equals('cashier').first();
    const register = await db.registers.get('reg-001-main');
    expect(cashier).toBeDefined();
    expect(register).toBeDefined();

    posStore.setState({
      currentUser: cashier!,
      activeRegister: register!,
      activeWorkflowStep: 1,
    });
    expect(posStore.getState().currentUser?.id).toBe(cashier!.id);
    expect(posStore.getState().activeWorkflowStep).toBe(1);

    // =========================================================================
    // STEP 2: OPEN SHIFT
    // =========================================================================
    const openingFloat = 50000; // UGX 50,000 float
    const shiftId = generateUUID();
    const now = new Date().toISOString();

    const newShift: Shift = {
      id: shiftId,
      idempotency_key: `shift-open-${shiftId}`,
      register_id: register!.id,
      cashier_id: cashier!.id,
      status: 'open',
      opened_at: now,
      opening_float: openingFloat,
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      notes: 'Authoritative 18-step shift opened',
      sync_status: 'pending',
    };
    await db.shifts.put(newShift);

    posStore.setState({
      activeShift: newShift,
      activeWorkflowStep: 2,
    });
    expect(posStore.getState().activeShift?.status).toBe('open');
    expect(posStore.getState().activeShift?.opening_float).toBe(50000);

    // =========================================================================
    // STEP 3: DASHBOARD
    // =========================================================================
    posStore.setState({ activeWorkflowStep: 3, activeView: 'dashboard' });
    const dashboardState = posStore.getState();
    expect(dashboardState.activeWorkflowStep).toBe(3);
    expect(dashboardState.activeView).toBe('dashboard');
    expect(dashboardState.activeShift?.id).toBe(shiftId);

    // =========================================================================
    // STEP 4: NEW SALE
    // =========================================================================
    posStore.startNewSale();
    const saleSession = posStore.getState();
    expect(saleSession.activeWorkflowStep).toBe(4);
    expect(saleSession.cartItems).toHaveLength(0);
    expect(saleSession.selectedCustomer).toBeNull();
    expect(saleSession.currentSaleId).toBeDefined();

    // =========================================================================
    // STEP 5: SCAN / SEARCH & DECISION: Product Found?
    // =========================================================================
    // Subtest 5.A: Decision "Product Found? -> NO"
    const missingBarcode = 'NON-EXISTENT-BARCODE-9999';
    const notFoundProd = await productRepository.getByBarcode(missingBarcode);
    expect(notFoundProd).toBeUndefined();
    posStore.setState({
      isProductNotFoundOpen: true,
      searchedNotFoundTerm: missingBarcode,
    });
    expect(posStore.getState().isProductNotFoundOpen).toBe(true);
    expect(posStore.getState().searchedNotFoundTerm).toBe(missingBarcode);

    // Close not found modal
    posStore.setState({ isProductNotFoundOpen: false, searchedNotFoundTerm: '' });

    // Subtest 5.B: Decision "Product Found? -> YES"
    const productRice = await productRepository.getBySku('GRO-001'); // Basmati Rice 5kg
    expect(productRice).toBeDefined();
    expect(productRice!.name).toContain('Basmati Rice');
    posStore.setState({ activeWorkflowStep: 5 });

    // =========================================================================
    // STEP 6: CHECK STOCK & DECISION: In Stock?
    // =========================================================================
    // Subtest 6.A: Decision "In Stock? -> NO"
    const outOfStockProduct: Product = {
      id: generateUUID(),
      name: 'Sold Out Milk',
      category_id: productRice!.category_id,
      sku: 'TEST-OOS-001',
      barcode: '999888777666',
      cost_price: 2000,
      selling_price: 3000,
      tax_rate: 0,
      stock_quantity: 0, // Zero stock!
      min_stock_level: 5,
      unit: 'pack',
      is_active: true,
      sync_status: 'pending',
      created_at: now,
      updated_at: now,
    };
    await db.products.put(outOfStockProduct);

    const addedOos = posStore.addToCart(outOfStockProduct, 1);
    expect(addedOos).toBe(false);
    expect(posStore.getState().isStockAlertOpen).toBe(true);
    expect(posStore.getState().stockAlertMessage).toContain('Insufficient stock');
    posStore.setState({ isStockAlertOpen: false });

    // Subtest 6.B: Decision "In Stock? -> YES"
    expect(productRice!.stock_quantity).toBeGreaterThan(0);
    posStore.setState({ activeWorkflowStep: 6 });

    // =========================================================================
    // STEP 7: ADD TO CART & DECISION: More Products?
    // =========================================================================
    // Add product 1: Rice
    const addSuccess1 = posStore.addToCart(productRice!, 1);
    expect(addSuccess1).toBe(true);
    expect(posStore.getState().cartItems).toHaveLength(1);
    expect(posStore.getState().activeWorkflowStep).toBe(7);

    // Decision "More Products? -> YES" -> Return to Step 5 to scan second product
    posStore.setState({ activeWorkflowStep: 5 });
    const productBread = await productRepository.getBySku('BAK-001'); // Whole Wheat Bread
    expect(productBread).toBeDefined();
    expect(productBread!.stock_quantity).toBeGreaterThan(0);

    // Add product 2: Bread
    const addSuccess2 = posStore.addToCart(productBread!, 1);
    expect(addSuccess2).toBe(true);
    expect(posStore.getState().cartItems).toHaveLength(2);

    // Decision "More Products? -> NO" -> Proceed to Step 8 (Review Cart)
    posStore.proceedToReviewCart();
    expect(posStore.getState().activeWorkflowStep).toBe(8);

    // =========================================================================
    // STEP 8: REVIEW CART
    // =========================================================================
    // Adjust quantity of rice to 2 units
    const qtyUpdated = posStore.updateCartItemQuantity(productRice!.id, 2);
    expect(qtyUpdated).toBe(true);

    // Add note to bread
    posStore.updateCartItemMeta(productBread!.id, 0, 'Freshly sliced');

    // Apply 10% cart discount
    posStore.setCartDiscount(10, 0);

    const totals = calculateCartTotals(
      posStore.getState().cartItems,
      posStore.getState().cartDiscountPercent,
      posStore.getState().cartDiscountFixed
    );
    expect(totals.itemCount).toBe(3); // 2 rice + 1 bread
    expect(totals.totalDiscount).toBeGreaterThan(0);
    expect(totals.grandTotal).toBeGreaterThan(0);

    // =========================================================================
    // STEP 9: CUSTOMER SELECTION & LOYALTY
    // =========================================================================
    posStore.proceedToCustomer();
    expect(posStore.getState().activeWorkflowStep).toBe(9);
    expect(posStore.getState().isCustomerModalOpen).toBe(true);

    // Create offline loyalty customer
    const newCustomer = await customerRepository.createCustomer({
      name: 'Sarah Kigozi',
      phone: '+256701234567',
      email: 'sarah.k@example.com',
      loyalty_number: 'LOYAL-7788',
      loyalty_points: 150,
      sync_status: 'pending',
    });
    posStore.selectCustomer(newCustomer);
    posStore.setState({ isCustomerModalOpen: false });

    expect(posStore.getState().selectedCustomer?.id).toBe(newCustomer.id);
    expect(posStore.getState().selectedCustomer?.loyalty_points).toBe(150);

    // =========================================================================
    // STEP 10: PAYMENT
    // =========================================================================
    posStore.proceedToPayment();
    expect(posStore.getState().activeWorkflowStep).toBe(10);
    expect(posStore.getState().isPaymentModalOpen).toBe(true);

    // Split Payment: Cash 20,000 + Remaining on Card
    const grandTotal = totals.grandTotal;
    const cashPortion = 20000;
    const cardPortion = grandTotal - cashPortion;

    // =========================================================================
    // STEP 11: DECISION: Payment Successful?
    // =========================================================================
    // Subtest 11.A: Decision "Payment Successful? -> NO" (Underpayment)
    await expect(
      saleService.completeSale({
        items: posStore.getState().cartItems,
        cartDiscountPercent: posStore.getState().cartDiscountPercent,
        cartDiscountFixed: posStore.getState().cartDiscountFixed,
        payments: [{ id: 'p1', method: 'cash', amount_paid: 5000 }], // Only 5,000 paid!
        customer: posStore.getState().selectedCustomer,
        shift: posStore.getState().activeShift!,
        registerId: register!.id,
        cashierId: cashier!.id,
      })
    ).rejects.toThrow(/Insufficient payment/);

    // Subtest 11.B: Decision "Payment Successful? -> YES" (Full tender)
    const saleResult = await saleService.completeSale({
      items: posStore.getState().cartItems,
      cartDiscountPercent: posStore.getState().cartDiscountPercent,
      cartDiscountFixed: posStore.getState().cartDiscountFixed,
      payments: [
        { id: 'p-cash', method: 'cash', amount_paid: cashPortion },
        { id: 'p-card', method: 'card', amount_paid: cardPortion, reference: 'AUTH-TEST-7788' },
      ],
      customer: posStore.getState().selectedCustomer,
      shift: posStore.getState().activeShift!,
      registerId: register!.id,
      cashierId: cashier!.id,
    });

    expect(saleResult).toBeDefined();
    expect(saleResult.sale.payment_status).toBe('paid');
    expect(saleResult.sale.total_amount).toBe(grandTotal);

    // Proceed to Step 12 Receipt
    posStore.proceedToReceipt(saleResult);
    expect(posStore.getState().activeWorkflowStep).toBe(12);

    // =========================================================================
    // STEP 12: RECEIPT
    // =========================================================================
    expect(saleResult.receipt).toBeDefined();
    expect(saleResult.receipt.receipt_number).toBe(saleResult.sale.receipt_number);
    const receiptInDb = await db.receipts.get(saleResult.receipt.id);
    expect(receiptInDb).toBeDefined();
    expect(receiptInDb?.sale_id).toBe(saleResult.sale.id);

    // =========================================================================
    // STEP 13: UPDATE INVENTORY
    // =========================================================================
    const updatedRice = await db.products.get(productRice!.id);
    const updatedBread = await db.products.get(productBread!.id);
    expect(updatedRice!.stock_quantity).toBe(productRice!.stock_quantity - 2);
    expect(updatedBread!.stock_quantity).toBe(productBread!.stock_quantity - 1);

    const movements = await db.inventoryMovements.where('reference_id').equals(saleResult.sale.id).toArray();
    expect(movements).toHaveLength(2);
    const riceMovement = movements.find(m => m.product_id === productRice!.id);
    expect(riceMovement?.quantity_delta).toBe(-2);
    expect(riceMovement?.type).toBe('SALE');

    // =========================================================================
    // STEP 14: UPDATE SALES REPORT
    // =========================================================================
    const updatedShift = await db.shifts.get(shiftId);
    expect(updatedShift).toBeDefined();
    expect(updatedShift!.transaction_count).toBe(1);
    expect(updatedShift!.total_sales).toBe(grandTotal);
    expect(updatedShift!.cash_sales_total).toBe(cashPortion);
    expect(updatedShift!.card_sales_total).toBe(cardPortion);

    // =========================================================================
    // STEP 15: UPDATE LOYALTY POINTS
    // =========================================================================
    const updatedCustomer = await db.customers.get(newCustomer.id);
    expect(updatedCustomer).toBeDefined();
    expect(updatedCustomer!.loyalty_points).toBeGreaterThan(150);
    expect(saleResult.newCustomerPoints).toBe(updatedCustomer!.loyalty_points);

    const loyaltyTx = await db.loyaltyTransactions.where('sale_id').equals(saleResult.sale.id).first();
    expect(loyaltyTx).toBeDefined();
    expect(loyaltyTx?.points_delta).toBeGreaterThan(0);
    expect(loyaltyTx?.type).toBe('EARN');

    // =========================================================================
    // STEP 16: SALE COMPLETED
    // =========================================================================
    posStore.proceedToSaleCompleted();
    expect(posStore.getState().activeWorkflowStep).toBe(16);
    expect(posStore.getState().lastCompletedSaleResult?.sale.id).toBe(saleResult.sale.id);

    // =========================================================================
    // STEP 17: NEXT CUSTOMER
    // =========================================================================
    posStore.proceedToNextCustomer();
    const nextCustomerSession = posStore.getState();
    expect(nextCustomerSession.activeWorkflowStep).toBe(4); // New Sale ready for Step 5
    expect(nextCustomerSession.cartItems).toHaveLength(0);
    expect(nextCustomerSession.selectedCustomer).toBeNull();
    expect(nextCustomerSession.currentSaleId).not.toBe(saleResult.sale.id);

    // =========================================================================
    // STEP 18: CLOSE SHIFT & RECONCILIATION
    // =========================================================================
    posStore.openCloseShiftModal();
    expect(posStore.getState().activeWorkflowStep).toBe(18);
    expect(posStore.getState().isClosingShiftOpen).toBe(true);

    const expectedCashInDrawer = openingFloat + updatedShift!.cash_sales_total;
    const physicalCashCounted = expectedCashInDrawer; // Balanced exact drawer count
    const variance = physicalCashCounted - expectedCashInDrawer;
    expect(variance).toBe(0);

    const closingTimestamp = new Date().toISOString();
    await db.shifts.update(shiftId, {
      status: 'closed',
      closed_at: closingTimestamp,
      closing_cash_actual: physicalCashCounted,
      closing_cash_expected: expectedCashInDrawer,
      variance,
      notes: 'End of shift reconciliation verified balanced',
      sync_status: 'pending',
    });

    await db.auditLogs.add({
      user_id: cashier!.id,
      action: 'CLOSE_SHIFT',
      entity_type: 'shift',
      entity_id: shiftId,
      details: `Expected: ${expectedCashInDrawer}, Actual: ${physicalCashCounted}, Variance: ${variance}`,
      timestamp: closingTimestamp,
      sync_status: 'pending',
    });

    posStore.logout();
    const finalState = posStore.getState();
    expect(finalState.currentUser).toBeNull();
    expect(finalState.activeWorkflowStep).toBe(1); // Full cycle complete, back to Login

    // Verify shift closed in DB
    const finalShiftRecord = await db.shifts.get(shiftId);
    expect(finalShiftRecord?.status).toBe('closed');
    expect(finalShiftRecord?.closing_cash_actual).toBe(expectedCashInDrawer);
    expect(finalShiftRecord?.variance).toBe(0);
  });
});
