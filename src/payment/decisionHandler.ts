import { PaymentMethod } from '../types';
import {
  PaymentProcessResult,
  PaymentDecisionState,
  DecisionAction,
} from './types';
import { posStore } from '../store/posStore';

export type PaymentDecisionListener = (state: PaymentDecisionState) => void;

export class PaymentDecisionHandler {
  private state: PaymentDecisionState = {
    status: 'idle',
    lastResult: null,
    activeMethod: 'cash',
    tenders: [],
    failureReason: null,
    errorCode: null,
  };

  private listeners: Set<PaymentDecisionListener> = new Set();

  constructor(initialMethod: PaymentMethod = 'cash') {
    this.state.activeMethod = initialMethod;
  }

  public getState(): PaymentDecisionState {
    return { ...this.state };
  }

  public subscribe(listener: PaymentDecisionListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const s = this.getState();
    this.listeners.forEach(l => l(s));
  }

  public reset(activeMethod: PaymentMethod = 'cash') {
    this.state = {
      status: 'idle',
      lastResult: null,
      activeMethod,
      tenders: [],
      failureReason: null,
      errorCode: null,
    };
    this.emit();
  }

  /**
   * Authoritative Decision: Successful? -> YES -> Receipt
   */
  public handleSuccess(result: PaymentProcessResult) {
    this.state.status = 'successful';
    this.state.lastResult = result;
    this.state.tenders = result.tenders;
    this.state.failureReason = null;
    this.state.errorCode = null;
    this.emit();

    if (result.saleResult) {
      posStore.proceedToReceipt(result.saleResult);
    }
  }

  /**
   * Authoritative Decision: Successful? -> NO
   * Records failure reason and prepares Recovery Options (Retry, Change Method, Cancel)
   */
  public handleFailure(result: PaymentProcessResult) {
    this.state.status = 'failed';
    this.state.lastResult = result;
    this.state.tenders = result.tenders;
    this.state.failureReason = result.errorMessage || 'Payment could not be completed.';
    this.state.errorCode = result.errorCode || 'UNKNOWN_ERROR';
    this.emit();
  }

  /**
   * Recovery Action 1: RETRY
   * Re-evaluates tender and restarts payment processing
   */
  public actionRetry(): DecisionAction {
    this.state.status = 'processing';
    this.state.failureReason = null;
    this.state.errorCode = null;
    this.emit();
    return 'retry';
  }

  /**
   * Recovery Action 2: CHANGE METHOD
   * Switches payment method while preserving all cart and partial tenders
   */
  public actionChangeMethod(newMethod: PaymentMethod): DecisionAction {
    this.state.status = 'idle';
    this.state.activeMethod = newMethod;
    this.state.failureReason = null;
    this.state.errorCode = null;
    this.emit();
    return 'change_method';
  }

  /**
   * Recovery Action 3: CANCEL
   * Aborts payment attempt, preserves cart items, and returns safely to Step 8 (Review Cart)
   */
  public actionCancel(): DecisionAction {
    this.state.status = 'cancelled';
    this.state.failureReason = null;
    this.state.errorCode = null;
    this.emit();

    posStore.setState({
      isPaymentModalOpen: false,
      activeWorkflowStep: 8, // Safely returned to Step 8 Review Cart
    });
    return 'cancel';
  }
}
