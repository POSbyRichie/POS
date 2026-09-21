import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { Category } from '../../types';
import { generateUUID } from '../../utils/id';
import { isDummyCategoryId } from '../../utils/productionGuard';

export interface CreateCategoryParams {
  name: string;
  slug?: string;
  store_id?: string;
  color?: string;
  icon?: string;
  sort_order?: number;
  is_active?: boolean;
}

export class CategoryRepository extends BaseRepository<Category, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.categories);
  }

  override async getAll(): Promise<Category[]> {
    const categories = await this.db.categories
      .filter(c => !isDummyCategoryId(c.id))
      .toArray();

    return categories.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  /**
   * Generates a URL/code friendly slug from category name
   */
  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async getBySlug(slug: string): Promise<Category | undefined> {
    const cat = await this.db.categories.where('slug').equals(slug).first();
    if (cat && isDummyCategoryId(cat.id)) return undefined;
    return cat;
  }

  async getAllActive(): Promise<Category[]> {
    const categories = await this.db.categories
      .filter(c => c.is_active !== false && !isDummyCategoryId(c.id))
      .toArray();

    return categories.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  async createCategory(params: CreateCategoryParams): Promise<Category> {
    const {
      name,
      slug = this.generateSlug(name),
      store_id = '00000000-0000-0000-0000-000000000001',
      color = '#0284c7',
      icon = 'package',
      sort_order = 0,
      is_active = true,
    } = params;

    // Check slug uniqueness
    const existing = await this.getBySlug(slug);
    if (existing) {
      throw new Error(`Category with slug "${slug}" already exists`);
    }

    const now = new Date().toISOString();
    const category: Category = {
      id: generateUUID(),
      store_id,
      name,
      slug,
      color,
      icon,
      sort_order,
      is_active,
      sync_status: 'pending',
      created_at: now,
      updated_at: now,
    };

    await this.db.transaction('rw', [this.db.categories, this.db.syncQueue], async () => {
      await this.db.categories.put(category);

      await this.db.syncQueue.add({
        entity_type: 'category',
        entity_id: category.id,
        operation: 'INSERT',
        payload: JSON.stringify(category),
        idempotency_key: `cat-${category.id}`,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });
    });

    return category;
  }

  async updateCategory(id: string, changes: Partial<Omit<Category, 'id'>>): Promise<Category> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Category not found: ${id}`);
    }

    const now = new Date().toISOString();
    const updated: Category = {
      ...existing,
      ...changes,
      sync_status: 'pending',
      updated_at: now,
    };

    await this.db.transaction('rw', [this.db.categories, this.db.syncQueue], async () => {
      await this.db.categories.put(updated);

      await this.db.syncQueue.add({
        entity_type: 'category',
        entity_id: updated.id,
        operation: 'UPDATE',
        payload: JSON.stringify(updated),
        idempotency_key: `cat-upd-${updated.id}-${Date.now()}`,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });
    });

    return updated;
  }

  async deleteCategory(id: string): Promise<void> {
    // Soft delete by setting is_active = false
    await this.updateCategory(id, { is_active: false });
  }
}
