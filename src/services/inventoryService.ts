import { db } from '../db';
import { Product, InventoryMovement, CartItem, InventoryMovementType } from '../types';
import { generateUUID } from '../utils/id';

export class InventoryService {
  /**
   * Check locally available stock for a product (Step 6)
   */
  async checkStock(productId: string): Promise<{ inStock: boolean; available: number; product: Product | null }> {
    const product = await db.products.get(productId);
    if (!product) {
      return { inStock: false, available: 0, product: null };
    }
    const available = product.stock_quantity;
    return {
      inStock: available > 0,
      available,
      product,
    };
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
          updated_at: new Date().toISOString(),
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
          timestamp: new Date().toISOString(),
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
          created_at: new Date().toISOString(),
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
    let resultMovement: InventoryMovement | null = null;

    await db.transaction('rw', [db.products, db.inventoryMovements, db.syncQueue], async () => {
      const product = await db.products.get(productId);
      if (!product) throw new Error('Product not found');

      const previousQuantity = product.stock_quantity;
      const newQuantity = previousQuantity + quantityDelta;

      await db.products.update(productId, {
        stock_quantity: newQuantity,
        updated_at: new Date().toISOString(),
      });

      const movement: InventoryMovement = {
        id: generateUUID(),
        idempotency_key: `inv-adj-${Date.now()}-${productId}`,
        product_id: productId,
        register_id: registerId,
        type,
        quantity_delta: quantityDelta,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        user_id: userId,
        notes: notes || `Stock ${type}`,
        timestamp: new Date().toISOString(),
        sync_status: 'pending',
      };

      await db.inventoryMovements.put(movement);
      resultMovement = movement;

      await db.syncQueue.add({
        entity_type: 'inventory_movement',
        entity_id: movement.id,
        operation: 'INSERT',
        payload: JSON.stringify(movement),
        idempotency_key: movement.idempotency_key,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    });

    return resultMovement!;
  }
}

export const inventoryService = new InventoryService();
