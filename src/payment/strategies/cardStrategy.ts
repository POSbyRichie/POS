import { BasePaymentStrategy } from './baseStrategy';
import { PaymentMethod } from '../../types';
import {
  PaymentProcessRequest,
  TenderLineItem,
  PaymentValidationResult,
  PaymentProcessResult,
} from '../types';
import { saleService } from '../../services/saleService';

export class CardPaymentStrategy extends BasePaymentStrategy {
  readonly method: PaymentMethod = 'card';

  override validate(request: PaymentProcessRequest, tender: TenderLineItem): PaymentValidationResult {
    const baseValidation = super.validate(request, tender);
    if (!baseValidation.isValid) return baseValidation;

    // Must have transaction reference or authorization code
    const ref = tender.reference || tender.cardMetadata?.authCode;
    if (!ref || ref.trim().length === 0) {
      return {
        isValid: false,
        errorCode: 'MISSING_CARD_AUTH',
        errorMessage: 'Card terminal authorization code or reference is required.',
      };
    }

    if (request.tenders.length <= 1 && tender.amount < request.totalDue) {
      return {
        isValid: false,
        errorCode: 'INSUFFICIENT_CARD_AMOUNT',
        errorMessage: `Card payment amount (${tender.amount}) is less than total due (${request.totalDue}).`,
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

    // Capture card metadata safely (never store PAN or PIN)
    const authCode = tender.cardMetadata?.authCode || tender.reference || `AUTH-${Date.now().toString().slice(-6)}`;
    tender.reference = authCode;
    tender.cardMetadata = {
      authCode,
      brand: tender.cardMetadata?.brand || 'visa',
      last4: tender.cardMetadata?.last4 || '****',
      isOfflineAuthorized: true,
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
        change: 0,
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
        errorCode: 'CARD_PROCESSING_ERROR',
        errorMessage: err.message || 'Card payment processing failed.',
        canRetry: true,
      };
    }
  }
}

export const cardPaymentStrategy = new CardPaymentStrategy();
