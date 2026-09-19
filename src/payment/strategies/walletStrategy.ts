import { BasePaymentStrategy } from './baseStrategy';
import { PaymentMethod } from '../../types';
import {
  PaymentProcessRequest,
  TenderLineItem,
  PaymentValidationResult,
  PaymentProcessResult,
} from '../types';
import { saleService } from '../../services/saleService';

export class WalletPaymentStrategy extends BasePaymentStrategy {
  readonly method: PaymentMethod = 'wallet';

  override validate(request: PaymentProcessRequest, tender: TenderLineItem): PaymentValidationResult {
    const baseValidation = super.validate(request, tender);
    if (!baseValidation.isValid) return baseValidation;

    const ref = tender.reference || tender.walletMetadata?.transactionReference;
    if (!ref || ref.trim().length === 0) {
      return {
        isValid: false,
        errorCode: 'MISSING_WALLET_REFERENCE',
        errorMessage: 'Mobile money transaction ID or carrier reference is required.',
      };
    }

    if (request.tenders.length <= 1 && tender.amount < request.totalDue) {
      return {
        isValid: false,
        errorCode: 'INSUFFICIENT_WALLET_AMOUNT',
        errorMessage: `Wallet payment amount (${tender.amount}) is less than total due (${request.totalDue}).`,
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

    const ref = tender.reference || tender.walletMetadata?.transactionReference || `MM-${Date.now().toString().slice(-6)}`;
    tender.reference = ref;
    tender.walletMetadata = {
      carrier: tender.walletMetadata?.carrier || 'mtn_momo',
      phoneNumber: tender.walletMetadata?.phoneNumber || request.customer?.phone || '+256700000000',
      transactionReference: ref,
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
        errorCode: 'WALLET_PROCESSING_ERROR',
        errorMessage: err.message || 'Mobile wallet transaction could not be completed.',
        canRetry: true,
      };
    }
  }
}

export const walletPaymentStrategy = new WalletPaymentStrategy();
