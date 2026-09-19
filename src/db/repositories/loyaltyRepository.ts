import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { LoyaltyTransaction, LoyaltyTransactionType, Customer } from '../../types';
import { generateUUID } from '../../utils/id';

export interface RecordLoyaltyParams {
  customerId: string;
  pointsDelta: number;
  type: LoyaltyTransactionType; // 'EARN' | 'REDEEM' | 'ADJUST'
  saleId?: string;
  receiptNumber?: string;
  reason?: string;
  cashierId?: string;
}

export class LoyaltyRepository extends BaseRepository<LoyaltyTransaction, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.loyaltyTransactions);
  }

  /**
   * Primary ACID loyalty audit transaction:
   * Writes an immutable transaction record (LOYALTY TRANSACTION) rather than
   * simply mutating customer.points, guaranteeing an immutable financial-grade audit trail.
   */
  async recordTransaction(params: RecordLoyaltyParams): Promise<{ transaction: LoyaltyTransaction; customer: Customer }> {
    const { customerId, pointsDelta, type, saleId, receiptNumber, reason, cashierId } = params;
    const now = new Date().toISOString();
    const txId = generateUUID();
    const idempotencyKey = `loyalty-tx-${txId}`;

    const customer = await this.db.customers.get(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    const previousPoints = customer.loyalty_points || 0;
    const newPoints = Math.max(0, previousPoints + pointsDelta);

    const transactionRecord: LoyaltyTransaction = {
      id: txId,
      idempotency_key: idempotencyKey,
      customer_id: customerId,
      sale_id: saleId,
      receipt_number: receiptNumber,
      reason: reason || (type === 'EARN' ? `Earned from Sale #${receiptNumber || saleId || 'N/A'}` : type === 'REDEEM' ? `Redeemed points` : 'Manual adjustment'),
      cashier_id: cashierId,
      points_delta: pointsDelta,
      previous_points: previousPoints,
      new_points: newPoints,
      type,
      timestamp: now,
      sync_status: 'pending',
    };

    const updatedCustomer: Customer = {
      ...customer,
      loyalty_points: newPoints,
      updated_at: now,
      sync_status: 'pending',
    };

    await this.db.transaction(
      'rw',
      [this.db.loyaltyTransactions, this.db.customers, this.db.syncQueue, this.db.auditLogs],
      async () => {
        await this.db.loyaltyTransactions.put(transactionRecord);
        await this.db.customers.put(updatedCustomer);

        await this.db.syncQueue.add({
          entity_type: 'loyalty_transaction',
          entity_id: txId,
          operation: 'INSERT',
          payload: JSON.stringify(transactionRecord),
          idempotency_key: idempotencyKey,
          attempts: 0,
          max_attempts: 10,
          status: 'pending',
          created_at: now,
        });

        await this.db.auditLogs.add({
          user_id: cashierId || 'system',
          action: `LOYALTY_${type}`,
          entity_type: 'loyalty_transaction',
          entity_id: txId,
          details: `${pointsDelta >= 0 ? `+${pointsDelta}` : pointsDelta} points. Sale #${receiptNumber || saleId || 'N/A'}. Previous: ${previousPoints} -> New: ${newPoints}`,
          timestamp: now,
          sync_status: 'pending',
        });
      }
    );

    return { transaction: transactionRecord, customer: updatedCustomer };
  }

  async getCustomerTransactions(customerId: string): Promise<LoyaltyTransaction[]> {
    return this.db.loyaltyTransactions
      .where('customer_id')
      .equals(customerId)
      .reverse()
      .sortBy('timestamp');
  }

  async getAllTransactions(limit = 100): Promise<LoyaltyTransaction[]> {
    return this.db.loyaltyTransactions
      .reverse()
      .sortBy('timestamp')
      .then(txs => txs.slice(0, limit));
  }
}
