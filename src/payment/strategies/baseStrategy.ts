import { PaymentMethod, PaymentBreakdown } from '../../types';
import {
  PaymentStrategy,
  PaymentProcessRequest,
  TenderLineItem,
  PaymentValidationResult,
  PaymentProcessResult,
} from '../types';
import { calculatePaymentBreakdown } from '../../utils/money';

export abstract class BasePaymentStrategy implements PaymentStrategy {
  abstract readonly method: PaymentMethod;

  /**
   * Common monetary and state validation
   */
  validate(request: PaymentProcessRequest, tender: TenderLineItem): PaymentValidationResult {
    if (tender.amount <= 0) {
      return {
        isValid: false,
        errorCode: 'INVALID_AMOUNT',
        errorMessage: 'Tender amount must be greater than zero.',
      };
    }

    if (!request.shift || request.shift.status !== 'open') {
      return {
        isValid: false,
        errorCode: 'SHIFT_NOT_OPEN',
        errorMessage: 'An open shift is required to process payments.',
      };
    }

    return { isValid: true };
  }

  abstract process(request: PaymentProcessRequest, tender: TenderLineItem): Promise<PaymentProcessResult>;

  /**
   * Helper to map TenderLineItem array to PaymentBreakdown array for DB layer
   */
  protected toPaymentBreakdowns(tenders: TenderLineItem[]): PaymentBreakdown[] {
    return tenders.map(t => ({
      id: t.id,
      method: t.method,
      amount_paid: t.amount,
      reference: t.reference,
    }));
  }

  /**
   * Compute total balances and change across tenders
   */
  protected computeBreakdown(totalDue: number, tenders: TenderLineItem[]) {
    return calculatePaymentBreakdown(totalDue, tenders.map(t => ({ amount_paid: t.amount })));
  }
}
