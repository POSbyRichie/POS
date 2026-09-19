import { PosDatabase, db as defaultDb } from '../db';
import { Product, InventoryMovement, InventoryConflict, InventoryReconciliationResult } from '../types';
import { generateUUID } from '../utils/id';
import { logger } from '../utils/logger';

export class InventoryReconciliationEngine {
  /**
   * Reconciles an initial stock level against a sequence of inventory movements
   * (e.g. from multiple offline terminals).
   *
   * Business Rule for Multi-Terminal Offline Stock Conflicts:
   * 1. Terminals do NOT overwrite the global stock_quantity directly.
   * 2. Instead, each terminal logs signed inventory movement deltas (e.g. -4).
   * 3. When the server reconciles deltas: Reconciled = Initial + sum(deltas).
   * 4. If Reconciled < 0, an explicit InventoryConflict is detected and raised,
   *    rather than silently claiming stock is 0 or 1.
   */
  reconcileProductMovements(
    product: Pick<Product, 'id' | 'name' | 'sku'>,
    initialStock: number,
    movements: InventoryMovement[]
  ): InventoryReconciliationResult {
    // Only calculate for movements matching this product
    const relevantMovements = movements.filter(m => m.product_id === product.id);

    const totalDelta = relevantMovements.reduce((sum, m) => sum + m.quantity_delta, 0);
    const totalSold = relevantMovements
      .filter(m => m.quantity_delta < 0)
      .reduce((sum, m) => sum + Math.abs(m.quantity_delta), 0);

    const reconciledStock = initialStock + totalDelta;
    const hasConflict = reconciledStock < 0;

    let conflict: InventoryConflict | undefined = undefined;

    if (hasConflict) {
      const deficit = Math.abs(reconciledStock);
      const contributingRegisters = Array.from(
        new Set(relevantMovements.map(m => m.register_id).filter(Boolean))
      );
      const contributingMovementIds = relevantMovements.map(m => m.id);

      conflict = {
        id: generateUUID(),
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        initial_stock: initialStock,
        total_sold: totalSold,
        reconciled_stock: reconciledStock,
        deficit_quantity: deficit,
        contributing_registers: contributingRegisters,
        contributing_movement_ids: contributingMovementIds,
        status: 'detected',
        detected_at: new Date().toISOString(),
        resolution_strategy: 'ALLOW_NEGATIVE_AND_ALERT',
        resolution_notes: `Oversell conflict detected: Initial stock was ${initialStock}, but ${totalSold} units were sold across ${contributingRegisters.length} offline terminals (${contributingRegisters.join(', ')}). Reconciled physical stock is ${reconciledStock}. Deficit of ${deficit} units flagged for urgent replenishment.`,
      };

      logger.warn(
        'InventoryReconciliation',
        `OVERSELL CONFLICT DETECTED for ${product.name} (${product.sku}): Initial=${initialStock}, Sold=${totalSold}, Reconciled=${reconciledStock}, Deficit=${deficit}`
      );
    }

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      initialStock,
      totalDelta,
      reconciledStock,
      hasConflict,
      conflict,
    };
  }

  /**
   * Applies the reconciled stock to local database and writes audit log for any detected conflict
   */
  async applyReconciliation(
    reconciliation: InventoryReconciliationResult,
    db: PosDatabase = defaultDb
  ): Promise<void> {
    const now = new Date().toISOString();

    await db.transaction('rw', [db.products, db.auditLogs], async () => {
      // 1. Update product stock to accurate mathematical reality (can be negative)
      await db.products.update(reconciliation.productId, {
        stock_quantity: reconciliation.reconciledStock,
        updated_at: now,
      });

      // 2. If conflict detected, write immutable audit log entry
      if (reconciliation.hasConflict && reconciliation.conflict) {
        await db.auditLogs.add({
          user_id: 'system-inventory-reconciler',
          action: 'INVENTORY_OVERSELL_CONFLICT',
          entity_type: 'inventory_conflict',
          entity_id: reconciliation.conflict.id,
          details: reconciliation.conflict.resolution_notes || `Oversell of ${reconciliation.conflict.deficit_quantity} units on ${reconciliation.sku}`,
          timestamp: now,
          sync_status: 'pending',
        });
      }
    });
  }

  /**
   * Educational comparison helper proving why movement-based delta reconciliation
   * is strictly required over naive `stock_quantity` synchronization.
   */
  compareWithNaiveSync(
    initialStock: number,
    terminalSales: { registerId: string; soldQty: number }[]
  ): {
    naiveStockSync: {
      lastWriteWinsStock: number;
      salesLostCount: number;
      detectedDeficit: boolean;
      summary: string;
    };
    deltaReconciliation: {
      trueStock: number;
      deficitUnits: number;
      detectedDeficit: boolean;
      summary: string;
    };
  } {
    const totalSold = terminalSales.reduce((sum, t) => sum + t.soldQty, 0);
    const trueStock = initialStock - totalSold;

    // In naive sync, each terminal locally computes (initialStock - soldQty)
    // and sends that integer. If Terminal A sells 4 from 5 -> sends 1.
    // If Terminal B sells 4 from 5 -> sends 1.
    // Server takes the last write (1), effectively ignoring one of the sales!
    const lastTerminal = terminalSales[terminalSales.length - 1];
    const naiveLocalResult = initialStock - (lastTerminal?.soldQty || 0);

    return {
      naiveStockSync: {
        lastWriteWinsStock: naiveLocalResult,
        salesLostCount: totalSold - (lastTerminal?.soldQty || 0),
        detectedDeficit: false, // Naively believes stock is > 0!
        summary: `FAILED: Naive synchronization claims stock is ${naiveLocalResult}, completely missing the oversell and overwriting offline sales.`,
      },
      deltaReconciliation: {
        trueStock,
        deficitUnits: trueStock < 0 ? Math.abs(trueStock) : 0,
        detectedDeficit: trueStock < 0,
        summary: `SUCCESS: Movement delta reconciliation computes ${trueStock} and detects an explicit deficit of ${Math.abs(trueStock)} units.`,
      },
    };
  }
}

export const inventoryReconciliationEngine = new InventoryReconciliationEngine();
