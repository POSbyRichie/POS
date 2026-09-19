import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { Shift } from '../../types';
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

  async closeShift(params: CloseShiftParams): Promise<Shift> {
    const { shiftId, cashierId, closingCashActual, notes } = params;
    const now = new Date().toISOString();

    const existing = await this.get(shiftId);
    if (!existing) {
      throw new Error(`Shift not found: ${shiftId}`);
    }

    const expectedCash = (existing.opening_float || 0) + (existing.cash_sales_total || 0);
    const variance = closingCashActual - expectedCash;

    const updatedShift: Shift = {
      ...existing,
      status: 'closed',
      closed_at: now,
      closing_cash_actual: closingCashActual,
      closing_cash_expected: expectedCash,
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
