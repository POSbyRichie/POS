import { SyncQueueItem, InventoryMovement } from '../types';
import { inventoryReconciliationEngine } from './inventoryReconciliation';

export type ConflictResolutionAction = 'skip_duplicate' | 'apply_delta' | 'server_wins' | 'client_wins' | 'dead_letter';

export interface ConflictResolutionResult {
  resolved: boolean;
  action: ConflictResolutionAction;
  details: string;
}

export class ConflictResolver {
  /**
   * Evaluates a synchronization conflict for an entity payload and determines resolution strategy
   */
  resolveConflict(item: SyncQueueItem, error: unknown): ConflictResolutionResult {
    const errorMsg = typeof error === 'string'
      ? error
      : (error as { message?: string; details?: string; code?: string })?.message || String(error);

    // 1. Idempotency Key Duplicate
    // If the server rejected the operation because the idempotency key already exists,
    // this transaction was already successfully recorded on the server (e.g. earlier client timeout).
    if (
      errorMsg.includes('duplicate key') ||
      errorMsg.includes('idempotency_key') ||
      (error as { code?: string })?.code === '23505'
    ) {
      return {
        resolved: true,
        action: 'skip_duplicate',
        details: `Idempotency key ${item.idempotency_key} already exists on remote server. Marked as successfully synced.`,
      };
    }

    // 2. Inventory Delta Conflicts
    // In multi-register environments, inventory is reconciled via deltas (quantity_delta).
    if (item.entity_type === 'inventory_movement') {
      return {
        resolved: true,
        action: 'apply_delta',
        details: `Replaying relative inventory movement delta for idempotency key ${item.idempotency_key}`,
      };
    }

    // 3. Schema / Permanent Validation Failure -> Send to Dead Letter Storage
    if (errorMsg.includes('violates foreign key') || errorMsg.includes('violates check constraint')) {
      return {
        resolved: false,
        action: 'dead_letter',
        details: `Constraint violation for ${item.entity_type} ${item.entity_id}: ${errorMsg}`,
      };
    }

    // Default to dead letter or unhandled
    return {
      resolved: false,
      action: 'dead_letter',
      details: `Unresolved sync conflict: ${errorMsg}`,
    };
  }

  /**
   * Applies delta stock update to resolve concurrent offline sales on multiple devices
   */
  mergeInventoryDelta(currentStock: number, movementDelta: number): number {
    return currentStock + movementDelta;
  }

  /**
   * Applies loyalty points earned during offline transaction to existing customer balance
   */
  mergeLoyaltyPoints(currentPoints: number, earnedPoints: number): number {
    return Math.max(0, currentPoints + earnedPoints);
  }

  /**
   * Reconciles inventory movements from multiple offline terminals, detecting oversells
   */
  reconcileOfflineInventory(
    product: { id: string; name: string; sku: string },
    initialStock: number,
    movements: InventoryMovement[]
  ) {
    return inventoryReconciliationEngine.reconcileProductMovements(product, initialStock, movements);
  }
}

export const conflictResolver = new ConflictResolver();
