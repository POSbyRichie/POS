import { salesRepository, CreateSaleTransactionParams, CreateSaleTransactionResult } from '../db';
import {
  Sale,
  SaleItem,
  PaymentRecord,
  Receipt,
  LoyaltyTransaction,
  CartItem,
  PaymentBreakdown,
  Customer,
  Shift,
} from '../types';

export interface CompleteSaleParams extends CreateSaleTransactionParams {
  items: CartItem[];
  cartDiscountPercent?: number;
  cartDiscountFixed?: number;
  payments: PaymentBreakdown[];
  customer?: Customer | null;
  shift: Shift;
  registerId: string;
  cashierId: string;
  notes?: string;
  emailReceipt?: boolean;
  smsReceipt?: boolean;
  emailRecipient?: string;
  smsRecipient?: string;
}

export interface CompleteSaleResult {
  sale: Sale;
  items: SaleItem[];
  payments: PaymentRecord[];
  receipt: Receipt;
  loyaltyTransaction?: LoyaltyTransaction | null;
  newCustomerPoints?: number;
}

export class SaleService {
  /**
   * Execute atomic local sale completion.
   * Delegates to salesRepository which treats IndexedDB as the primary transactional store.
   */
  async completeSale(params: CompleteSaleParams): Promise<CompleteSaleResult> {
    const result: CreateSaleTransactionResult = await salesRepository.createSaleTransaction(params);

    return {
      sale: result.sale,
      items: result.items,
      payments: result.payments,
      receipt: result.receipt,
      loyaltyTransaction: result.loyaltyTransaction,
      newCustomerPoints: result.newCustomerPoints,
    };
  }
}

export const saleService = new SaleService();
