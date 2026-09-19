import { PaymentMethod, CartItem, Customer, Shift } from '../types';
import { CompleteSaleResult } from '../services/saleService';

export type PaymentExecutionStatus = 'idle' | 'processing' | 'successful' | 'failed' | 'cancelled';

export interface CardMetadata {
  authCode: string;
  brand?: 'visa' | 'mastercard' | 'amex' | 'local_debit' | 'other';
  last4?: string;
  isOfflineAuthorized?: boolean;
}

export interface WalletMetadata {
  carrier: 'mtn_momo' | 'airtel_money' | 'other';
  phoneNumber: string;
  transactionReference: string;
}

export interface QrMetadata {
  qrPayload: string;
  merchantId: string;
  transactionReference: string;
  scannedAt: string;
}

export interface CashMetadata {
  tenderedAmount: number;
  changeGiven: number;
  cashDrawerOpenTriggered: boolean;
}

export interface TenderLineItem {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  cardMetadata?: CardMetadata;
  walletMetadata?: WalletMetadata;
  qrMetadata?: QrMetadata;
  cashMetadata?: CashMetadata;
  status: 'pending' | 'captured' | 'failed';
  timestamp: string;
}

export interface PaymentProcessRequest {
  saleId: string;
  totalDue: number;
  items: CartItem[];
  cartDiscountPercent?: number;
  cartDiscountFixed?: number;
  tenders: TenderLineItem[];
  customer?: Customer | null;
  shift: Shift;
  registerId: string;
  cashierId: string;
  notes?: string;
}

export interface PaymentValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface PaymentProcessResult {
  success: boolean;
  status: PaymentExecutionStatus;
  totalDue: number;
  totalPaid: number;
  change: number;
  tenders: TenderLineItem[];
  saleResult?: CompleteSaleResult;
  errorCode?: string;
  errorMessage?: string;
  canRetry: boolean;
}

export interface PaymentStrategy {
  readonly method: PaymentMethod;
  validate(request: PaymentProcessRequest, tender: TenderLineItem): PaymentValidationResult;
  process(request: PaymentProcessRequest, tender: TenderLineItem): Promise<PaymentProcessResult>;
  cancel?(tender: TenderLineItem): Promise<void>;
}

export type DecisionAction = 'receipt' | 'retry' | 'change_method' | 'cancel';

export interface PaymentDecisionState {
  status: PaymentExecutionStatus;
  lastResult: PaymentProcessResult | null;
  activeMethod: PaymentMethod;
  tenders: TenderLineItem[];
  failureReason: string | null;
  errorCode: string | null;
}
