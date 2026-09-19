import { BasePaymentStrategy } from './baseStrategy';
import { PaymentMethod, PaymentBreakdown } from '../../types';
import {
  PaymentProcessRequest,
  TenderLineItem,
  PaymentValidationResult,
  PaymentProcessResult,
} from '../types';
import { saleService } from '../../services/saleService';

export class SplitPaymentStrategy extends BasePaymentStrategy {
  readonly method: PaymentMethod = 'split';

  /**
   * Validate entire collection of split tenders
   */
  validateSplit(request: PaymentProcessRequest): PaymentValidationResult {
    if (!request.tenders || request.tenders.length === 0) {
      return {
        isValid: false,
        errorCode: 'EMPTY_TENDERS',
        errorMessage: 'At least one payment tender must be provided.',
      };
    }

    let totalPaid = 0;
    for (const tender of request.tenders) {
      if (tender.amount <= 0) {
        return {
          isValid: false,
          errorCode: 'INVALID_TENDER_AMOUNT',
          errorMessage: `Tender for ${tender.method} has an invalid amount (${tender.amount}).`,
        };
      }

      // Non-cash tenders require references
      if (tender.method !== 'cash' && (!tender.reference || tender.reference.trim() === '')) {
        return {
          isValid: false,
          errorCode: 'MISSING_TENDER_REFERENCE',
          errorMessage: `Payment reference required for ${tender.method.toUpperCase()} tender.`,
        };
      }

      totalPaid += tender.amount;
    }

    if (totalPaid < request.totalDue) {
      const shortfall = request.totalDue - totalPaid;
      return {
        isValid: false,
        errorCode: 'INSUFFICIENT_TOTAL_SPLIT',
        errorMessage: `Total paid (${totalPaid}) is less than total due (${request.totalDue}). Shortfall: ${shortfall}.`,
      };
    }

    return { isValid: true };
  }

  override validate(request: PaymentProcessRequest, _tender: TenderLineItem): PaymentValidationResult {
    return this.validateSplit(request);
  }

  async process(request: PaymentProcessRequest, _tender?: TenderLineItem): Promise<PaymentProcessResult> {
    const validation = this.validateSplit(request);
    const totalPaid = request.tenders.reduce((acc, t) => acc + (t.amount || 0), 0);
    const change = Math.max(0, totalPaid - request.totalDue);

    if (!validation.isValid) {
      return {
        success: false,
        status: 'failed',
        totalDue: request.totalDue,
        totalPaid,
        change: 0,
        tenders: request.tenders,
        errorCode: validation.errorCode,
        errorMessage: validation.errorMessage,
        canRetry: true,
      };
    }

    // Mark all tenders as captured
    const capturedTenders = request.tenders.map(t => {
      const isCash = t.method === 'cash';
      return {
        ...t,
        status: 'captured' as const,
        cashMetadata: isCash
          ? {
              tenderedAmount: t.amount,
              changeGiven: change,
              cashDrawerOpenTriggered: true,
            }
          : undefined,
      };
    });

    const paymentBreakdowns: PaymentBreakdown[] = capturedTenders.map(t => ({
      id: t.id,
      method: t.method,
      amount_paid: t.amount,
      reference: t.reference,
    }));

    try {
      const saleResult = await saleService.completeSale({
        items: request.items,
        cartDiscountPercent: request.cartDiscountPercent,
        cartDiscountFixed: request.cartDiscountFixed,
        payments: paymentBreakdowns,
        customer: request.customer,
        shift: request.shift,
        registerId: request.registerId,
        cashierId: request.cashierId,
        notes: request.notes,
      });

      return {
        success: true,
        status: 'successful',
        totalDue: request.totalDue,
        totalPaid,
        change,
        tenders: capturedTenders,
        saleResult,
        canRetry: false,
      };
    } catch (err: any) {
      const failedTenders = request.tenders.map(t => ({ ...t, status: 'failed' as const }));
      return {
        success: false,
        status: 'failed',
        totalDue: request.totalDue,
        totalPaid,
        change: 0,
        tenders: failedTenders,
        errorCode: 'SPLIT_TRANSACTION_FAILED',
        errorMessage: err.message || 'Failed to commit split payment sale to database.',
        canRetry: true,
      };
    }
  }
}

export const splitPaymentStrategy = new SplitPaymentStrategy();
