import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { Product, InventoryMovement, InventoryMovementType } from '../../types';
import { generateUUID } from '../../utils/id';

export class InventoryRepository extends BaseRepository<InventoryMovement, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.inventoryMovements);
  }

  /**
   * Check locally available stock for a product
   */
  async checkStock(productId: string): Promise<{ inStock: boolean; available: number; product: Product | null }> {
    const product = await this.db.products.get(productId);
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
   * Manual stock adjustment / restock / damage entry
   * Commits stock quantity update, movement record, and sync queue entry atomically.
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
    const now = new Date().toISOString();

    await this.db.transaction('rw', [this.db.products, this.db.inventoryMovements, this.db.syncQueue], async () => {
      const product = await this.db.products.get(productId);
      if (!product) throw new Error('Product not found');

      const previousQuantity = product.stock_quantity;
      const newQuantity = previousQuantity + quantityDelta;

      await this.db.products.update(productId, {
        stock_quantity: newQuantity,
        updated_at: now,
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
        timestamp: now,
        sync_status: 'pending',
      };

      await this.db.inventoryMovements.put(movement);
      resultMovement = movement;

      await this.db.syncQueue.add({
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
    });

    return resultMovement!;
  }

  async getMovementsByProduct(productId: string): Promise<InventoryMovement[]> {
    return this.db.inventoryMovements.where('product_id').equals(productId).toArray();
  }

  async getMovementsByShift(shiftId: string): Promise<InventoryMovement[]> {
    return this.db.inventoryMovements.where('shift_id').equals(shiftId).toArray();
  }

  async getRecentMovements(limit = 100): Promise<InventoryMovement[]> {
    return this.db.inventoryMovements.reverse().limit(limit).toArray();
  }

  async getLowStockAlerts(): Promise<{ product: Product; deficit: number; isOutOfStock: boolean }[]> {
    const lowStockProducts = await this.db.products
      .filter(p => p.is_active !== false && p.stock_quantity <= p.min_stock_level)
      .toArray();

    return lowStockProducts.map(product => ({
      product,
      deficit: Math.max(0, product.min_stock_level - product.stock_quantity),
      isOutOfStock: product.stock_quantity <= 0,
    }));
  }
}
