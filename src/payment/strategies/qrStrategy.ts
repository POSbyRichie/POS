import { BasePaymentStrategy } from './baseStrategy';
import { PaymentMethod } from '../../types';
import {
  PaymentProcessRequest,
  TenderLineItem,
  PaymentValidationResult,
  PaymentProcessResult,
} from '../types';
import { saleService } from '../../services/saleService';

export class QrPaymentStrategy extends BasePaymentStrategy {
  readonly method: PaymentMethod = 'qr';

  /**
   * Helper to generate EMVCo-compliant or standard merchant QR payload
   */
  generateQrPayload(request: PaymentProcessRequest, tender: TenderLineItem): string {
    const merchant = request.registerId || 'TERMINAL-01';
    const amount = tender.amount;
    const saleRef = request.saleId.slice(0, 8);
    return `POSQR|STORE:ANTIGRAVITY|MERCHANT:${merchant}|AMOUNT:${amount}|CUR:UGX|REF:${saleRef}|TS:${Date.now()}`;
  }

  override validate(request: PaymentProcessRequest, tender: TenderLineItem): PaymentValidationResult {
    const baseValidation = super.validate(request, tender);
    if (!baseValidation.isValid) return baseValidation;

    const ref = tender.reference || tender.qrMetadata?.transactionReference;
    if (!ref || ref.trim().length === 0) {
      return {
        isValid: false,
        errorCode: 'MISSING_QR_CONFIRMATION',
        errorMessage: 'QR payment scan verification reference is required.',
      };
    }

    if (request.tenders.length <= 1 && tender.amount < request.totalDue) {
      return {
        isValid: false,
        errorCode: 'INSUFFICIENT_QR_AMOUNT',
        errorMessage: `QR payment amount (${tender.amount}) is less than total due (${request.totalDue}).`,
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

    const ref = tender.reference || tender.qrMetadata?.transactionReference || `QR-${Date.now().toString().slice(-6)}`;
    tender.reference = ref;
    tender.qrMetadata = {
      qrPayload: tender.qrMetadata?.qrPayload || this.generateQrPayload(request, tender),
      merchantId: request.registerId || 'MERCHANT-01',
      transactionReference: ref,
      scannedAt: new Date().toISOString(),
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
        errorCode: 'QR_PROCESSING_ERROR',
        errorMessage: err.message || 'QR code payment verification failed.',
        canRetry: true,
      };
    }
  }
}

export const qrPaymentStrategy = new QrPaymentStrategy();
