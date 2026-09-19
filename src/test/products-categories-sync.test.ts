import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  productRepository,
  categoryRepository,
  inventoryRepository,
} from '../db';
import { syncEngine } from '../sync/syncEngine';
import { connectivityService } from '../services/connectivity';
import { Product, Category } from '../types';

describe('Products, Categories, Stock Movements, Search & Bidirectional Sync', () => {
  beforeEach(async () => {
    connectivityService.setSimulatedOffline(true);

    await Promise.all([
      db.products.clear(),
      db.categories.clear(),
      db.inventoryMovements.clear(),
      db.syncQueue.clear(),
      db.syncErrors.clear(),
      db.auditLogs.clear(),
    ]);
  });

  describe('Categories Management', () => {
    it('creates, updates, and fetches categories with unique slugs and sync queueing', async () => {
      // 1. Create Category
      const cat = await categoryRepository.createCategory({
        name: 'Organic Beverages',
        color: '#0284c7',
        icon: 'coffee',
        sort_order: 1,
      });

      expect(cat.id).toBeDefined();
      expect(cat.slug).toBe('organic-beverages');
      expect(cat.sync_status).toBe('pending');

      // 2. Reject duplicate slug
      await expect(
        categoryRepository.createCategory({
          name: 'Organic Beverages',
        })
      ).rejects.toThrow(/already exists/);

      // 3. Update Category
      const updated = await categoryRepository.updateCategory(cat.id, {
        name: 'Organic & Cold Beverages',
      });
      expect(updated.name).toBe('Organic & Cold Beverages');

      // 4. Verify Sync Queue has INSERT and UPDATE
      const queueItems = await db.syncQueue
        .where('entity_type')
        .equals('category')
        .toArray();
      expect(queueItems).toHaveLength(2);
      expect(queueItems[0].operation).toBe('INSERT');
      expect(queueItems[1].operation).toBe('UPDATE');

      // 5. Fetch Active Categories
      const activeCats = await categoryRepository.getAllActive();
      expect(activeCats).toHaveLength(1);
      expect(activeCats[0].name).toBe('Organic & Cold Beverages');
    });
  });

  describe('Products, SKUs, Barcodes, Prices & Stock Movements', () => {
    it('creates a product with unique SKU/Barcode, logs opening movement, and enqueues sync mutation', async () => {
      const category = await categoryRepository.createCategory({ name: 'Snacks & Bites' });

      // Create Product with initial stock of 30 units
      const product = await productRepository.createProduct(
        {
          name: 'Plantain Crisps 100g',
          category_id: category.id,
          sku: 'SNK-PLNT-01',
          barcode: '600123456789',
          cost_price: 1500, // minor units
          selling_price: 2500,
          tax_rate: 18,
          unit: 'pkt',
          stock_quantity: 30,
          min_stock_level: 5,
          description: 'Crunchy salted plantain chips',
        },
        {
          userId: 'user-manager-01',
          registerId: 'reg-01',
        }
      );

      expect(product.id).toBeDefined();
      expect(product.sku).toBe('SNK-PLNT-01');
      expect(product.barcode).toBe('600123456789');
      expect(product.stock_quantity).toBe(30);

      // Verify SKU uniqueness check
      await expect(
        productRepository.createProduct({
          name: 'Different Chips',
          category_id: category.id,
          sku: 'SNK-PLNT-01', // duplicate SKU
          barcode: '999999999999',
          cost_price: 1000,
          selling_price: 2000,
        })
      ).rejects.toThrow(/already exists/);

      // Verify Barcode uniqueness check
      await expect(
        productRepository.createProduct({
          name: 'Different Chips',
          category_id: category.id,
          sku: 'SNK-DIFF-02',
          barcode: '600123456789', // duplicate Barcode
          cost_price: 1000,
          selling_price: 2000,
        })
      ).rejects.toThrow(/already exists/);

      // Verify Initial Stock Intake Movement logged in inventory movements
      const movements = await inventoryRepository.getMovementsByProduct(product.id);
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe('RESTOCK');
      expect(movements[0].quantity_delta).toBe(30);
      expect(movements[0].previous_quantity).toBe(0);
      expect(movements[0].new_quantity).toBe(30);

      // Verify Sync Queue entries for product and initial stock movement
      const syncItems = await db.syncQueue.toArray();
      expect(syncItems.some(i => i.entity_type === 'product' && i.entity_id === product.id)).toBe(true);
      expect(syncItems.some(i => i.entity_type === 'inventory_movement')).toBe(true);
    });

    it('calculates profit margins and generates formatted SKUs and Barcodes', () => {
      // Cost 1500, Selling 2500 -> Profit = 1000 / 2500 = 40.00%
      const margin = productRepository.calculateMargin(1500, 2500);
      expect(margin).toBe(40);

      // Cost 2000, Selling 3000 -> 33.33%
      const margin2 = productRepository.calculateMargin(2000, 3000);
      expect(margin2).toBe(33.33);

      // SKU generator
      const sku = productRepository.generateSKU('BEV');
      expect(sku).toMatch(/^BEV-[A-Z0-9]{4}-\d{4}$/);

      // Barcode generator
      const barcode = productRepository.generateBarcode();
      expect(barcode).toMatch(/^600\d{9}$/);
    });

    it('records manual stock adjustments with audit movement trail', async () => {
      const category = await categoryRepository.createCategory({ name: 'Bakery' });
      const product = await productRepository.createProduct({
        name: 'French Baguette',
        category_id: category.id,
        sku: 'BAK-FBN-01',
        barcode: '600987654321',
        cost_price: 2000,
        selling_price: 3500,
        stock_quantity: 15,
      });

      // 1. Record Damage (-3 units)
      const damageMov = await inventoryRepository.adjustStock(
        product.id,
        -3,
        'DAMAGE',
        'reg-01',
        'user-cashier-01',
        'Stale bread expired'
      );
      expect(damageMov.quantity_delta).toBe(-3);
      expect(damageMov.new_quantity).toBe(12);

      let updatedProduct = await productRepository.get(product.id);
      expect(updatedProduct?.stock_quantity).toBe(12);

      // 2. Record Restock (+20 units)
      const restockMov = await inventoryRepository.adjustStock(
        product.id,
        20,
        'RESTOCK',
        'reg-01',
        'user-manager-01',
        'Afternoon delivery'
      );
      expect(restockMov.quantity_delta).toBe(20);
      expect(restockMov.new_quantity).toBe(32);

      updatedProduct = await productRepository.get(product.id);
      expect(updatedProduct?.stock_quantity).toBe(32);
    });
  });

  describe('Low-Stock Levels & Alerts', () => {
    it('accurately identifies low-stock and out-of-stock products with deficits', async () => {
      const category = await categoryRepository.createCategory({ name: 'Produce' });

      // Product 1: In Stock (stock: 20, min: 5)
      await productRepository.createProduct({
        name: 'In-Stock Oranges',
        category_id: category.id,
        sku: 'ORG-001',
        barcode: '100000000001',
        cost_price: 500,
        selling_price: 1000,
        stock_quantity: 20,
        min_stock_level: 5,
      });

      // Product 2: Low Stock (stock: 3, min: 10) -> Deficit: 7
      await productRepository.createProduct({
        name: 'Low-Stock Lemons',
        category_id: category.id,
        sku: 'LMN-002',
        barcode: '100000000002',
        cost_price: 400,
        selling_price: 800,
        stock_quantity: 3,
        min_stock_level: 10,
      });

      // Product 3: Out of Stock (stock: 0, min: 5) -> Deficit: 5
      await productRepository.createProduct({
        name: 'Out-of-Stock Limes',
        category_id: category.id,
        sku: 'LIM-003',
        barcode: '100000000003',
        cost_price: 300,
        selling_price: 700,
        stock_quantity: 0,
        min_stock_level: 5,
      });

      // Query Low Stock Products
      const lowStockProducts = await productRepository.getLowStockProducts();
      expect(lowStockProducts).toHaveLength(2); // Low-Stock Lemons + Out-of-Stock Limes

      // Query Low Stock Alerts
      const alerts = await inventoryRepository.getLowStockAlerts();
      expect(alerts).toHaveLength(2);

      const lemonAlert = alerts.find(a => a.product.sku === 'LMN-002');
      expect(lemonAlert?.deficit).toBe(7);
      expect(lemonAlert?.isOutOfStock).toBe(false);

      const limeAlert = alerts.find(a => a.product.sku === 'LIM-003');
      expect(limeAlert?.deficit).toBe(5);
      expect(limeAlert?.isOutOfStock).toBe(true);
    });
  });

  describe('Multi-Criteria Product Search', () => {
    it('searches by Barcode, SKU, Name, Description, Category, and Stock Status', async () => {
      const catBev = await categoryRepository.createCategory({ name: 'Cold Drinks' });
      const catFood = await categoryRepository.createCategory({ name: 'Fast Food' });

      await productRepository.createProduct({
        name: 'Sparkling Mineral Water',
        category_id: catBev.id,
        sku: 'BEV-SPK-01',
        barcode: '777000111',
        description: 'Refreshing carbonated water',
        cost_price: 1000,
        selling_price: 2000,
        stock_quantity: 50,
        min_stock_level: 10,
      });

      await productRepository.createProduct({
        name: 'Cheeseburger Deluxe',
        category_id: catFood.id,
        sku: 'BUR-CHZ-01',
        barcode: '777000222',
        description: 'Grilled beef patty with cheddar cheese',
        cost_price: 6000,
        selling_price: 12000,
        stock_quantity: 4, // Low stock (min is 10)
        min_stock_level: 10,
      });

      await productRepository.createProduct({
        name: 'Classic Fries Large',
        category_id: catFood.id,
        sku: 'FRI-CLS-01',
        barcode: '777000333',
        description: 'Golden crispy french fries',
        cost_price: 2000,
        selling_price: 5000,
        stock_quantity: 0, // Out of stock
        min_stock_level: 10,
      });

      // 1. Search by exact Barcode
      const byBarcode = await productRepository.getByBarcode('777000111');
      expect(byBarcode?.name).toBe('Sparkling Mineral Water');

      // 2. Search by exact SKU
      const bySku = await productRepository.getBySku('BUR-CHZ-01');
      expect(bySku?.name).toBe('Cheeseburger Deluxe');

      // 3. Search by partial Name
      const byName = await productRepository.search('burger');
      expect(byName).toHaveLength(1);
      expect(byName[0].sku).toBe('BUR-CHZ-01');

      // 4. Search by Description text
      const byDesc = await productRepository.search('carbonated');
      expect(byDesc).toHaveLength(1);
      expect(byDesc[0].sku).toBe('BEV-SPK-01');

      // 5. Search with Category Filter
      const foodItems = await productRepository.search('', { categoryId: catFood.id });
      expect(foodItems).toHaveLength(2);

      // 6. Search with Stock Status Filter: Low Stock
      const lowStockItems = await productRepository.search('', { stockFilter: 'low_stock' });
      expect(lowStockItems).toHaveLength(1);
      expect(lowStockItems[0].name).toBe('Cheeseburger Deluxe');

      // 7. Search with Stock Status Filter: Out of Stock
      const outOfStockItems = await productRepository.search('', { stockFilter: 'out_of_stock' });
      expect(outOfStockItems).toHaveLength(1);
      expect(outOfStockItems[0].name).toBe('Classic Fries Large');
    });
  });

  describe('Bidirectional Supabase ↕ IndexedDB Synchronization', () => {
    it('pushes local offline products and categories to Supabase and reconciles pull without losing offline deltas', async () => {
      // Mock Supabase client
      const mockRemoteDb = {
        categories: [] as Category[],
        products: [] as Product[],
      };

      const mockSupabase: any = {
        from: (table: string) => ({
          upsert: async (payload: any) => {
            if (table === 'products') {
              const existingIdx = mockRemoteDb.products.findIndex(p => p.id === payload.id);
              if (existingIdx >= 0) {
                mockRemoteDb.products[existingIdx] = { ...mockRemoteDb.products[existingIdx], ...payload };
              } else {
                mockRemoteDb.products.push(payload);
              }
            } else if (table === 'categories') {
              const existingIdx = mockRemoteDb.categories.findIndex(c => c.id === payload.id);
              if (existingIdx >= 0) {
                mockRemoteDb.categories[existingIdx] = { ...mockRemoteDb.categories[existingIdx], ...payload };
              } else {
                mockRemoteDb.categories.push(payload);
              }
            }
            return { error: null };
          },
          select: () => ({
            eq: () => Promise.resolve({ data: mockRemoteDb[table as 'products' | 'categories'], error: null }),
            then: (resolve: any) => resolve({ data: mockRemoteDb[table as 'products' | 'categories'], error: null }),
          }),
        }),
      };

      syncEngine.setSupabaseClient(mockSupabase);

      // 1. Create a Category & Product locally while offline
      const localCat = await categoryRepository.createCategory({ name: 'Dairy Cold' });
      const localProd = await productRepository.createProduct({
        name: 'Vanilla Yogurt 250ml',
        category_id: localCat.id,
        sku: 'DAI-YOG-01',
        barcode: '600888999111',
        cost_price: 1200,
        selling_price: 2200,
        stock_quantity: 40,
        min_stock_level: 5,
      });

      // 2. Reconnect internet: triggers automatic background queue sync to Supabase
      connectivityService.setSimulatedOffline(false);
      connectivityService.setStatus('online');

      // Wait for sync queue worker to process all pending items
      for (let attempts = 0; attempts < 30; attempts++) {
        const pending = await db.syncQueue.where('status').equals('pending').count();
        if (pending === 0) break;
        await syncEngine.processQueue();
        await new Promise(r => setTimeout(r, 40));
      }

      const pendingAfterSync = await db.syncQueue.where('status').equals('pending').count();
      expect(pendingAfterSync).toBe(0);

      // Verify remote mock database received the product and category
      expect(mockRemoteDb.categories).toHaveLength(1);
      expect(mockRemoteDb.categories[0].name).toBe('Dairy Cold');
      expect(mockRemoteDb.products).toHaveLength(1);
      expect(mockRemoteDb.products[0].sku).toBe('DAI-YOG-01');

      // 3. Reconcile Stock Delta:
      // Now simulate a customer buys 5 yogurts while offline (local inventory movement delta = -5)
      await inventoryRepository.adjustStock(
        localProd.id,
        -5,
        'SALE',
        'reg-01',
        'cashier-01',
        'Sold 5 yogurts offline'
      );

      const stockBeforePull = (await productRepository.get(localProd.id))?.stock_quantity;
      expect(stockBeforePull).toBe(35); // 40 - 5 = 35

      // Simulate remote Supabase still having stock_quantity = 40 because sale is not yet pushed
      mockRemoteDb.products[0].stock_quantity = 40;

      // 4. Remote Catalog Pull:
      // When pullUpdatesFromSupabase runs, it must NOT overwrite the 35 with 40!
      // It reconciles remote stock (40) with pending local delta (-5) = 35!
      await syncEngine.pullUpdatesFromSupabase();

      const stockAfterPull = (await productRepository.get(localProd.id))?.stock_quantity;
      expect(stockAfterPull).toBe(35); // Preserved!
    });
  });
});
