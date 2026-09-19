import { loyaltyRepository } from '../db/repositories';
import { LoyaltyTransaction, Customer } from '../types';
import { db, PosDatabase } from '../db';

export interface LoyaltySummary {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsLiability: number;
  activeLoyaltyCustomersCount: number;
}

export class LoyaltyService {
  constructor(
    private readonly repo = loyaltyRepository,
    private readonly database: PosDatabase = db
  ) {}

  async recordEarn(params: {
    customerId: string;
    pointsEarned: number;
    saleId: string;
    receiptNumber: string;
    cashierId?: string;
  }): Promise<{ transaction: LoyaltyTransaction; customer: Customer }> {
    return this.repo.recordTransaction({
      customerId: params.customerId,
      pointsDelta: params.pointsEarned,
      type: 'EARN',
      saleId: params.saleId,
      receiptNumber: params.receiptNumber,
      reason: `Earned from Sale #${params.receiptNumber}`,
      cashierId: params.cashierId,
    });
  }

  async recordRedeem(params: {
    customerId: string;
    pointsRedeemed: number;
    saleId?: string;
    receiptNumber?: string;
    reason?: string;
    cashierId?: string;
  }): Promise<{ transaction: LoyaltyTransaction; customer: Customer }> {
    return this.repo.recordTransaction({
      customerId: params.customerId,
      pointsDelta: -Math.abs(params.pointsRedeemed),
      type: 'REDEEM',
      saleId: params.saleId,
      receiptNumber: params.receiptNumber,
      reason: params.reason || (params.receiptNumber ? `Redemption on Sale #${params.receiptNumber}` : 'Points redemption discount'),
      cashierId: params.cashierId,
    });
  }

  async recordAdjustment(params: {
    customerId: string;
    pointsDelta: number;
    reason: string;
    cashierId: string;
  }): Promise<{ transaction: LoyaltyTransaction; customer: Customer }> {
    return this.repo.recordTransaction({
      customerId: params.customerId,
      pointsDelta: params.pointsDelta,
      type: 'ADJUST',
      reason: params.reason,
      cashierId: params.cashierId,
    });
  }

  async getCustomerLedger(customerId: string): Promise<LoyaltyTransaction[]> {
    return this.repo.getCustomerTransactions(customerId);
  }

  async getAllTransactions(limit = 100): Promise<LoyaltyTransaction[]> {
    return this.repo.getAllTransactions(limit);
  }

  async getLoyaltySummary(): Promise<LoyaltySummary> {
    const [customers, txs] = await Promise.all([
      this.database.customers.toArray(),
      this.database.loyaltyTransactions.toArray(),
    ]);

    const totalPointsLiability = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);
    const totalPointsIssued = txs
      .filter(t => t.type === 'EARN' || (t.type === 'ADJUST' && t.points_delta > 0))
      .reduce((sum, t) => sum + t.points_delta, 0);

    const totalPointsRedeemed = txs
      .filter(t => t.type === 'REDEEM' || (t.type === 'ADJUST' && t.points_delta < 0))
      .reduce((sum, t) => sum + Math.abs(t.points_delta), 0);

    const activeLoyaltyCustomersCount = customers.filter(c => (c.loyalty_points || 0) > 0).length;

    return {
      totalPointsIssued,
      totalPointsRedeemed,
      totalPointsLiability,
      activeLoyaltyCustomersCount,
    };
  }
}

export const loyaltyService = new LoyaltyService();
