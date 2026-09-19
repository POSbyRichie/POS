import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { Product } from '../../types';

export class ProductRepository extends BaseRepository<Product, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.products);
  }

  async getByBarcode(barcode: string): Promise<Product | undefined> {
    return this.db.products.where('barcode').equals(barcode).first();
  }

  async getBySku(sku: string): Promise<Product | undefined> {
    return this.db.products.where('sku').equals(sku).first();
  }

  async getByCategory(categoryId: string): Promise<Product[]> {
    return this.db.products.where('category_id').equals(categoryId).toArray();
  }

  async getActiveProducts(): Promise<Product[]> {
    return this.db.products.filter(p => p.is_active).toArray();
  }

  async search(query: string): Promise<Product[]> {
    const q = query.toLowerCase().trim();
    if (!q) return this.getActiveProducts();

    return this.db.products
      .filter(p => {
        return (
          p.is_active &&
          (p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.barcode.toLowerCase().includes(q) ||
            Boolean(p.description && p.description.toLowerCase().includes(q)))
        );
      })
      .toArray();
  }
}
