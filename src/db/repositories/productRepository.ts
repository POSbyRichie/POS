import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { Product, ProductFilterOptions, InventoryMovement } from '../../types';
import { generateUUID } from '../../utils/id';

export interface CreateProductParams {
  id?: string;
  store_id?: string;
  sku: string;
  barcode: string;
  name: string;
  description?: string;
  category_id: string;
  cost_price: number;
  selling_price: number;
  tax_rate?: number;
  unit?: string;
  stock_quantity?: number;
  min_stock_level?: number;
  image_url?: string;
  is_active?: boolean;
}

export class ProductRepository extends BaseRepository<Product, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.products);
  }

  async getByBarcode(barcode: string): Promise<Product | undefined> {
    const clean = barcode.trim();
    return this.db.products.where('barcode').equals(clean).first();
  }

  async getBySku(sku: string): Promise<Product | undefined> {
    const clean = sku.trim();
    return this.db.products.where('sku').equals(clean).first();
  }

  async getByCategory(categoryId: string): Promise<Product[]> {
    return this.db.products.where('category_id').equals(categoryId).toArray();
  }

  async getActiveProducts(): Promise<Product[]> {
    return this.db.products.filter(p => p.is_active !== false).toArray();
  }

  async getLowStockProducts(): Promise<Product[]> {
    return this.db.products
      .filter(p => p.is_active !== false && p.stock_quantity <= p.min_stock_level)
      .toArray();
  }

  /**
   * Multi-criteria product search:
   * Matches query string against name, sku, barcode, and description.
   * Applies optional category and stock status filters.
   */
  async search(query: string, options: ProductFilterOptions = {}): Promise<Product[]> {
    const { categoryId, stockFilter = 'all', activeOnly = true } = options;
    const q = query.toLowerCase().trim();

    return this.db.products
      .filter(p => {
        // 1. Active filter
        if (activeOnly && p.is_active === false) {
          return false;
        }

        // 2. Category filter
        if (categoryId && categoryId !== 'all' && p.category_id !== categoryId) {
          return false;
        }

        // 3. Stock filter
        if (stockFilter === 'out_of_stock' && p.stock_quantity > 0) {
          return false;
        }
        if (stockFilter === 'low_stock' && (p.stock_quantity <= 0 || p.stock_quantity > p.min_stock_level)) {
          return false;
        }
        if (stockFilter === 'in_stock' && p.stock_quantity <= p.min_stock_level) {
          return false;
        }

        // 4. Query text search (if present)
        if (!q) return true;

        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          Boolean(p.description && p.description.toLowerCase().includes(q))
        );
      })
      .toArray();
  }

  /**
   * Validates and creates a new product in IndexedDB, optionally logging initial stock intake
   * and enqueuing product creation to syncQueue for cloud replication.
   */
  async createProduct(
    params: CreateProductParams,
    context?: { userId?: string; registerId?: string; shiftId?: string }
  ): Promise<Product> {
    if (context?.userId) {
      const user = await this.db.users.get(context.userId);
      if (user?.role === 'cashier') {
        throw new Error('Unauthorized: Cashiers are not permitted to create products.');
      }
    }

    const {
      sku,

      barcode,
      name,
      category_id,
      cost_price,
      selling_price,
      tax_rate = 18,
      unit = 'pcs',
      stock_quantity = 0,
      min_stock_level = 5,
      description = '',
      image_url = '',
      is_active = true,
      store_id = '00000000-0000-0000-0000-000000000001',
    } = params;

    // Validate SKU uniqueness
    const existingSku = await this.getBySku(sku);
    if (existingSku) {
      throw new Error(`Product with SKU "${sku}" already exists (${existingSku.name})`);
    }

    // Validate Barcode uniqueness
    const existingBarcode = await this.getByBarcode(barcode);
    if (existingBarcode) {
      throw new Error(`Product with Barcode "${barcode}" already exists (${existingBarcode.name})`);
    }

    if (cost_price < 0 || selling_price < 0) {
      throw new Error('Prices cannot be negative');
    }

    const now = new Date().toISOString();
    const productId = params.id || generateUUID();

    const product: Product = {
      id: productId,
      store_id,
      category_id,
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim(),
      name: name.trim(),
      description: description.trim(),
      cost_price,
      selling_price,
      tax_rate,
      unit,
      stock_quantity,
      min_stock_level,
      image_url,
      is_active,
      sync_status: 'pending',
      created_at: now,
      updated_at: now,
    };

    await this.db.transaction(
      'rw',
      [this.db.products, this.db.inventoryMovements, this.db.syncQueue],
      async () => {
        // 1. Put product
        await this.db.products.put(product);

        // 2. If initial stock is positive, record initial stock intake movement
        if (stock_quantity > 0) {
          const movement: InventoryMovement = {
            id: generateUUID(),
            idempotency_key: `inv-init-${productId}`,
            product_id: productId,
            register_id: context?.registerId || 'reg-01',
            shift_id: context?.shiftId,
            type: 'RESTOCK',
            quantity_delta: stock_quantity,
            previous_quantity: 0,
            new_quantity: stock_quantity,
            user_id: context?.userId || 'system',
            notes: 'Initial opening inventory stock',
            timestamp: now,
            sync_status: 'pending',
          };

          await this.db.inventoryMovements.put(movement);

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
        }

        // 3. Enqueue product creation
        await this.db.syncQueue.add({
          entity_type: 'product',
          entity_id: productId,
          operation: 'INSERT',
          payload: JSON.stringify(product),
          idempotency_key: `prod-${productId}`,
          attempts: 0,
          max_attempts: 10,
          status: 'pending',
          created_at: now,
        });
      }
    );

    return product;
  }

  /**
   * Updates an existing product and enqueues sync mutation
   */
  async updateProduct(id: string, changes: Partial<Omit<Product, 'id'>>, userId?: string): Promise<Product> {
    if (userId) {
      const user = await this.db.users.get(userId);
      if (user?.role === 'cashier') {
        throw new Error('Unauthorized: Cashiers are not permitted to modify products.');
      }
    }

    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Product not found: ${id}`);
    }


    if (changes.sku && changes.sku !== existing.sku) {
      const duplicateSku = await this.getBySku(changes.sku);
      if (duplicateSku && duplicateSku.id !== id) {
        throw new Error(`Product with SKU "${changes.sku}" already exists`);
      }
    }

    if (changes.barcode && changes.barcode !== existing.barcode) {
      const duplicateBarcode = await this.getByBarcode(changes.barcode);
      if (duplicateBarcode && duplicateBarcode.id !== id) {
        throw new Error(`Product with Barcode "${changes.barcode}" already exists`);
      }
    }

    const now = new Date().toISOString();
    const updated: Product = {
      ...existing,
      ...changes,
      sync_status: 'pending',
      updated_at: now,
    };

    await this.db.transaction('rw', [this.db.products, this.db.syncQueue], async () => {
      await this.db.products.put(updated);

      await this.db.syncQueue.add({
        entity_type: 'product',
        entity_id: updated.id,
        operation: 'UPDATE',
        payload: JSON.stringify(updated),
        idempotency_key: `prod-upd-${updated.id}-${Date.now()}`,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });
    });

    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.updateProduct(id, { is_active: false });
  }

  // Helper calculation and generator utilities
  calculateMargin(costPrice: number, sellingPrice: number): number {
    if (sellingPrice <= 0) return 0;
    return Math.round(((sellingPrice - costPrice) / sellingPrice) * 10000) / 100; // e.g. 33.33%
  }

  generateSKU(prefix = 'PROD'): string {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const numSuffix = Math.floor(1000 + Math.random() * 9000);
    return `${prefix.toUpperCase()}-${randomSuffix}-${numSuffix}`;
  }

  generateBarcode(): string {
    // Generate 12-digit standard EAN/UPC style numeric barcode with checksum
    let digits = '600' + Math.floor(10000000 + Math.random() * 90000000).toString();
    if (digits.length > 11) digits = digits.slice(0, 11);

    // Calculate check digit (modulo 10)
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      const n = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? n * 1 : n * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return `${digits}${checkDigit}`;
  }
}
