import { Shift, CashMovement } from '../types';
import { shiftRepository } from '../db/repositories';
import { OpenShiftParams, CloseShiftParams, RecordCashMovementParams, ShiftCashReconciliation } from '../db/repositories/shiftRepository';
import { db } from '../db';

export class ShiftService {
  constructor(private readonly repo = shiftRepository) {}

  async getActiveShift(registerId: string): Promise<Shift | undefined> {
    return this.repo.getActiveShift(registerId);
  }

  async getAllShifts(): Promise<Shift[]> {
    return db.shifts.reverse().sortBy('opened_at');
  }

  async getShiftById(shiftId: string): Promise<Shift | undefined> {
    return this.repo.get(shiftId);
  }

  async openShift(params: OpenShiftParams): Promise<Shift> {
    return this.repo.openShift(params);
  }

  async recordCashMovement(params: RecordCashMovementParams): Promise<CashMovement> {
    return this.repo.recordCashMovement(params);
  }

  async getCashMovements(shiftId: string): Promise<CashMovement[]> {
    return this.repo.getCashMovements(shiftId);
  }

  async calculateExpectedCash(shiftId: string): Promise<ShiftCashReconciliation> {
    return this.repo.calculateExpectedCash(shiftId);
  }

  async closeShift(params: CloseShiftParams): Promise<Shift> {
    return this.repo.closeShift(params);
  }
}

export const shiftService = new ShiftService();
