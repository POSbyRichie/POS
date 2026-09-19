import { PaymentMethod } from '../types';
import {
  PaymentStrategy,
  PaymentProcessRequest,
  PaymentProcessResult,
  TenderLineItem,
} from './types';
import {
  cashPaymentStrategy,
  cardPaymentStrategy,
  walletPaymentStrategy,
  qrPaymentStrategy,
  splitPaymentStrategy,
} from './strategies';
import { PaymentDecisionHandler } from './decisionHandler';
import { generateUUID } from '../utils/id';

export class PaymentEngine {
  private strategies: Map<PaymentMethod, PaymentStrategy> = new Map();
  public readonly decisionHandler: PaymentDecisionHandler;

  constructor() {
    this.registerStrategy(cashPaymentStrategy);
    this.registerStrategy(cardPaymentStrategy);
    this.registerStrategy(walletPaymentStrategy);
    this.registerStrategy(qrPaymentStrategy);
    this.registerStrategy(splitPaymentStrategy);

    this.decisionHandler = new PaymentDecisionHandler();
  }

  public registerStrategy(strategy: PaymentStrategy) {
    this.strategies.set(strategy.method, strategy);
  }

  public getStrategy(method: PaymentMethod): PaymentStrategy {
    const strategy = this.strategies.get(method);
    if (!strategy) {
      throw new Error(`No payment strategy registered for method: ${method}`);
    }
    return strategy;
  }

  /**
   * Helper to create a standardized TenderLineItem
   */
  public createTender(
    method: PaymentMethod,
    amount: number,
    reference?: string,
    metadata?: Record<string, any>
  ): TenderLineItem {
    return {
      id: generateUUID(),
      method,
      amount,
      reference,
      cardMetadata: method === 'card' ? metadata as any : undefined,
      walletMetadata: method === 'wallet' ? metadata as any : undefined,
      qrMetadata: method === 'qr' ? metadata as any : undefined,
      cashMetadata: method === 'cash' ? metadata as any : undefined,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Primary payment execution pipeline:
   * Chooses strategy (single or split), executes validation, commits transaction.
   */
  public async process(request: PaymentProcessRequest): Promise<PaymentProcessResult> {
    const isSplit = request.tenders.length > 1 || (request.tenders[0] && request.tenders[0].method === 'split');

    let result: PaymentProcessResult;

    if (isSplit) {
      const splitStrategy = this.getStrategy('split');
      result = await splitStrategy.process(request, request.tenders[0]);
    } else {
      const primaryTender = request.tenders[0];
      if (!primaryTender) {
        return {
          success: false,
          status: 'failed',
          totalDue: request.totalDue,
          totalPaid: 0,
          change: 0,
          tenders: [],
          errorCode: 'NO_TENDERS_SPECIFIED',
          errorMessage: 'No payment tender was specified.',
          canRetry: true,
        };
      }

      const strategy = this.getStrategy(primaryTender.method);
      result = await strategy.process(request, primaryTender);
    }

    return result;
  }

  /**
   * Process payment and automatically route through the Decision Engine
   * (YES -> Receipt, NO -> Retry / Change method / Cancel)
   */
  public async processWithDecision(request: PaymentProcessRequest): Promise<PaymentProcessResult> {
    const result = await this.process(request);

    if (result.success) {
      this.decisionHandler.handleSuccess(result);
    } else {
      this.decisionHandler.handleFailure(result);
    }

    return result;
  }
}

export const paymentEngine = new PaymentEngine();
