import { db, inventoryRepository } from '../db';
import { Product, InventoryMovement, CartItem, InventoryMovementType } from '../types';
import { generateUUID } from '../utils/id';

export class InventoryService {
  /**
   * Check locally available stock for a product (Step 6)
   */
  async checkStock(productId: string): Promise<{ inStock: boolean; available: number; product: Product | null }> {
    return inventoryRepository.checkStock(productId);
  }

  /**
   * Decrease inventory locally immediately after sale (Step 13)
   * Decrements product quantity in IndexedDB and logs immutable movement record.
   * Atomically enqueues sync queue item.
   */
  async decrementStockForSale(
    items: CartItem[],
    saleId: string,
    shiftId: string,
    registerId: string,
    userId: string
  ): Promise<InventoryMovement[]> {
    const movements: InventoryMovement[] = [];
    const now = new Date().toISOString();

    await db.transaction('rw', [db.products, db.inventoryMovements, db.syncQueue], async () => {
      for (const item of items) {
        const product = await db.products.get(item.product.id);
        if (!product) continue;

        const previousQuantity = product.stock_quantity;
        const soldQty = item.quantity;
        const newQuantity = previousQuantity - soldQty;

        // Decrement stock
        await db.products.update(product.id, {
          stock_quantity: newQuantity,
          updated_at: now,
        });

        const movement: InventoryMovement = {
          id: generateUUID(),
          idempotency_key: `inv-sale-${saleId}-${item.product.id}`,
          product_id: product.id,
          register_id: registerId,
          shift_id: shiftId,
          type: 'SALE',
          quantity_delta: -soldQty,
          previous_quantity: previousQuantity,
          new_quantity: newQuantity,
          reference_id: saleId,
          user_id: userId,
          notes: `Sold in Sale #${saleId.slice(0, 8)}`,
          timestamp: now,
          sync_status: 'pending',
        };

        await db.inventoryMovements.put(movement);
        movements.push(movement);

        // Enqueue to sync queue
        await db.syncQueue.add({
          entity_type: 'inventory_movement',
          entity_id: movement.id,
          operation: 'INSERT',
          payload: JSON.stringify(movement),
          idempotency_key: movement.idempotency_key,
          attempts: 0,
          max_attempts: 10,
          status: 'pending',
          created_at: now,
        });
      }
    });

    return movements;
  }

  /**
   * Manual stock adjustment / restock / damage entry (Inventory Manager / Admin)
   */
  async adjustStock(
    productId: string,
    quantityDelta: number,
    type: InventoryMovementType,
    registerId: string,
    userId: string,
    notes?: string
  ): Promise<InventoryMovement> {
    return inventoryRepository.adjustStock(productId, quantityDelta, type, registerId, userId, notes);
  }
}

export const inventoryService = new InventoryService();
