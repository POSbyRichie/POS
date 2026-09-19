import { BasePaymentStrategy } from './baseStrategy';
import { PaymentMethod } from '../../types';
import {
  PaymentProcessRequest,
  TenderLineItem,
  PaymentValidationResult,
  PaymentProcessResult,
} from '../types';
import { saleService } from '../../services/saleService';

export class CashPaymentStrategy extends BasePaymentStrategy {
  readonly method: PaymentMethod = 'cash';

  override validate(request: PaymentProcessRequest, tender: TenderLineItem): PaymentValidationResult {
    const baseValidation = super.validate(request, tender);
    if (!baseValidation.isValid) return baseValidation;

    // Single cash tender must cover the total due
    if (request.tenders.length <= 1 && tender.amount < request.totalDue) {
      return {
        isValid: false,
        errorCode: 'INSUFFICIENT_CASH',
        errorMessage: `Cash tendered (${tender.amount}) is less than total due (${request.totalDue}).`,
      };
    }

    return { isValid: true };
  }

  async process(request: PaymentProcessRequest, tender: TenderLineItem): Promise<PaymentProcessResult> {
    const validation = this.validate(request, tender);
    if (!validation.isValid) {
      return {
        success: false,
        status: 'failed',
        totalDue: request.totalDue,
        totalPaid: tender.amount,
        change: 0,
        tenders: [tender],
        errorCode: validation.errorCode,
        errorMessage: validation.errorMessage,
        canRetry: true,
      };
    }

    const change = Math.max(0, tender.amount - request.totalDue);

    tender.cashMetadata = {
      tenderedAmount: tender.amount,
      changeGiven: change,
      cashDrawerOpenTriggered: true,
    };
    tender.status = 'captured';

    try {
      const saleResult = await saleService.completeSale({
        items: request.items,
        cartDiscountPercent: request.cartDiscountPercent,
        cartDiscountFixed: request.cartDiscountFixed,
        payments: this.toPaymentBreakdowns([tender]),
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
        totalPaid: tender.amount,
        change,
        tenders: [tender],
        saleResult,
        canRetry: false,
      };
    } catch (err: any) {
      tender.status = 'failed';
      return {
        success: false,
        status: 'failed',
        totalDue: request.totalDue,
        totalPaid: tender.amount,
        change: 0,
        tenders: [tender],
        errorCode: 'TRANSACTION_COMMIT_FAILED',
        errorMessage: err.message || 'Failed to commit cash sale transaction to database.',
        canRetry: true,
      };
    }
  }
}

export const cashPaymentStrategy = new CashPaymentStrategy();
