import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { Shift, CashMovement, CashMovementType } from '../../types';
import { generateUUID } from '../../utils/id';

export interface OpenShiftParams {
  registerId: string;
  cashierId: string;
  openingFloat: number;
}

export interface CloseShiftParams {
  shiftId: string;
  cashierId: string;
  closingCashActual: number;
  notes?: string;
}

export interface RecordCashMovementParams {
  shiftId: string;
  registerId: string;
  cashierId: string;
  type: CashMovementType;
  amount: number; // in minor units UGX
  reason: string;
}

export interface ShiftCashReconciliation {
  openingFloat: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
}

export class ShiftRepository extends BaseRepository<Shift, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.shifts);
  }

  async getActiveShift(registerId: string): Promise<Shift | undefined> {
    return this.db.shifts
      .where('register_id')
      .equals(registerId)
      .filter(shift => shift.status === 'open')
      .first();
  }

  async openShift(params: OpenShiftParams): Promise<Shift> {
    const { registerId, cashierId, openingFloat } = params;
    const now = new Date().toISOString();
    const shiftId = generateUUID();
    const idempotencyKey = `shift-open-${shiftId}`;

    const shiftRecord: Shift = {
      id: shiftId,
      idempotency_key: idempotencyKey,
      register_id: registerId,
      cashier_id: cashierId,
      status: 'open',
      opened_at: now,
      opening_float: openingFloat,
      total_sales: 0,
      transaction_count: 0,
      cash_sales_total: 0,
      card_sales_total: 0,
      wallet_sales_total: 0,
      qr_sales_total: 0,
      cash_in_total: 0,
      cash_out_total: 0,
      sync_status: 'pending',
    };

    await this.db.transaction('rw', [this.db.shifts, this.db.syncQueue, this.db.auditLogs], async () => {
      await this.db.shifts.put(shiftRecord);

      await this.db.syncQueue.add({
        entity_type: 'shift',
        entity_id: shiftId,
        operation: 'INSERT',
        payload: JSON.stringify(shiftRecord),
        idempotency_key: idempotencyKey,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });

      await this.db.auditLogs.add({
        user_id: cashierId,
        action: 'SHIFT_OPENED',
        entity_type: 'shift',
        entity_id: shiftId,
        details: `Opening float: ${openingFloat}`,
        timestamp: now,
        sync_status: 'pending',
      });
    });

    return shiftRecord;
  }

  /**
   * Cash movements within an active shift:
   * Supports Pay In, Pay Out, Safe Drop, and Drawer Count Adjustment
   */
  async recordCashMovement(params: RecordCashMovementParams): Promise<CashMovement> {
    const { shiftId, registerId, cashierId, type, amount, reason } = params;
    const now = new Date().toISOString();
    const movementId = generateUUID();
    const idempotencyKey = `cash-movement-${movementId}`;

    const existingShift = await this.get(shiftId);
    if (!existingShift) {
      throw new Error(`Shift not found: ${shiftId}`);
    }
    if (existingShift.status !== 'open') {
      throw new Error(`Cannot record cash movement on closed shift: ${shiftId}`);
    }

    const movement: CashMovement = {
      id: movementId,
      idempotency_key: idempotencyKey,
      shift_id: shiftId,
      register_id: registerId,
      cashier_id: cashierId,
      type,
      amount,
      reason: reason.trim(),
      timestamp: now,
      sync_status: 'pending',
    };

    const isCashIn = type === 'PAY_IN';
    const isCashOut = type === 'PAY_OUT' || type === 'SAFE_DROP';

    const newCashIn = (existingShift.cash_in_total || 0) + (isCashIn ? amount : 0);
    const newCashOut = (existingShift.cash_out_total || 0) + (isCashOut ? amount : 0);

    await this.db.transaction('rw', [this.db.shifts, this.db.cashMovements, this.db.syncQueue, this.db.auditLogs], async () => {
      await this.db.cashMovements.put(movement);

      await this.db.shifts.update(shiftId, {
        cash_in_total: newCashIn,
        cash_out_total: newCashOut,
      });

      await this.db.syncQueue.add({
        entity_type: 'cash_movement' as any,
        entity_id: movementId,
        operation: 'INSERT',
        payload: JSON.stringify(movement),
        idempotency_key: idempotencyKey,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });

      await this.db.auditLogs.add({
        user_id: cashierId,
        action: `CASH_${type}`,
        entity_type: 'cash_movement',
        entity_id: movementId,
        details: `${type}: ${amount} UGX. Reason: ${reason}`,
        timestamp: now,
        sync_status: 'pending',
      });
    });

    return movement;
  }

  async getCashMovements(shiftId: string): Promise<CashMovement[]> {
    return this.db.cashMovements.where('shift_id').equals(shiftId).toArray();
  }

  /**
   * Calculates mathematically reconciled expected cash:
   * Expected Cash = Opening Float + Cash Sales + Cash In - Cash Out
   */
  async calculateExpectedCash(shiftId: string): Promise<ShiftCashReconciliation> {
    const shift = await this.get(shiftId);
    if (!shift) {
      throw new Error(`Shift not found: ${shiftId}`);
    }

    const movements = await this.getCashMovements(shiftId);
    const cashIn = movements
      .filter(m => m.type === 'PAY_IN')
      .reduce((sum, m) => sum + m.amount, 0);

    const cashOut = movements
      .filter(m => m.type === 'PAY_OUT' || m.type === 'SAFE_DROP')
      .reduce((sum, m) => sum + m.amount, 0);

    const openingFloat = shift.opening_float || 0;
    const cashSales = shift.cash_sales_total || 0;
    const expectedCash = openingFloat + cashSales + cashIn - cashOut;

    return {
      openingFloat,
      cashSales,
      cashIn,
      cashOut,
      expectedCash,
      actualCash: shift.closing_cash_actual,
      variance: shift.variance,
    };
  }

  async closeShift(params: CloseShiftParams): Promise<Shift> {
    const { shiftId, cashierId, closingCashActual, notes } = params;
    const now = new Date().toISOString();

    const existing = await this.get(shiftId);
    if (!existing) {
      throw new Error(`Shift not found: ${shiftId}`);
    }

    const reconciliation = await this.calculateExpectedCash(shiftId);
    const expectedCash = reconciliation.expectedCash;
    const variance = closingCashActual - expectedCash;

    const updatedShift: Shift = {
      ...existing,
      status: 'closed',
      closed_at: now,
      closing_cash_actual: closingCashActual,
      closing_cash_expected: expectedCash,
      cash_in_total: reconciliation.cashIn,
      cash_out_total: reconciliation.cashOut,
      variance,
      notes: notes || existing.notes,
      sync_status: 'pending',
    };

    await this.db.transaction('rw', [this.db.shifts, this.db.syncQueue, this.db.auditLogs], async () => {
      await this.db.shifts.put(updatedShift);

      await this.db.syncQueue.add({
        entity_type: 'shift',
        entity_id: shiftId,
        operation: 'UPDATE',
        payload: JSON.stringify(updatedShift),
        idempotency_key: `shift-close-${shiftId}`,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });

      await this.db.auditLogs.add({
        user_id: cashierId,
        action: 'SHIFT_CLOSED',
        entity_type: 'shift',
        entity_id: shiftId,
        details: `Expected: ${expectedCash}, Actual: ${closingCashActual}, Variance: ${variance}`,
        timestamp: now,
        sync_status: 'pending',
      });
    });

    return updatedShift;
  }
}
