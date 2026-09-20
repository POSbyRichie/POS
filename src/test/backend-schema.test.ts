import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { generateUUID } from '../utils/id';

describe('Backend Database Architecture & Schema Verification', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const migration1Path = path.join(migrationsDir, '20260919000001_initial_pos_schema.sql');
  const migration2Path = path.join(migrationsDir, '20260919000002_rls_and_security.sql');
  const migration3Path = path.join(migrationsDir, '20260919000003_rpc_atomic_sync.sql');
  const seedPath = path.resolve(__dirname, '../../supabase/seed.sql');

  const requiredTables = [
    'profiles',
    'roles',
    'permissions',
    'stores',
    'registers',
    'devices',
    'categories',
    'products',
    'inventory',
    'inventory_movements',
    'customers',
    'loyalty_accounts',
    'loyalty_transactions',
    'shifts',
    'sales',
    'sale_items',
    'payments',
    'payment_items',
    'receipts',
    'sync_queue',
    'audit_logs',
  ];

  it('verifies that all migration files and seed data file exist', () => {
    expect(fs.existsSync(migration1Path)).toBe(true);
    expect(fs.existsSync(migration2Path)).toBe(true);
    expect(fs.existsSync(migration3Path)).toBe(true);
    expect(fs.existsSync(seedPath)).toBe(true);
  });

  it('verifies all 21 required tables are created in migration 1 with constraints and foreign keys', () => {
    const ddl = fs.readFileSync(migration1Path, 'utf8');

    for (const table of requiredTables) {
      const regex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i');
      expect(ddl).toMatch(regex);
    }

    // Verify foreign key integrity keywords
    expect(ddl).toContain('REFERENCES stores(id)');
    expect(ddl).toContain('REFERENCES products(id)');
    expect(ddl).toContain('REFERENCES sales(id)');
    expect(ddl).toContain('REFERENCES registers(id)');
    expect(ddl).toContain('REFERENCES shifts(id)');
    expect(ddl).toContain('REFERENCES profiles(id)');
    expect(ddl).toContain('REFERENCES customers(id)');

    // Verify CHECK constraints
    expect(ddl).toContain('CONSTRAINT chk_products_cost_non_negative CHECK (cost_price >= 0)');
    expect(ddl).toContain('CONSTRAINT chk_products_selling_non_negative CHECK (selling_price >= 0)');
    expect(ddl).toContain('CONSTRAINT chk_sale_items_qty_positive CHECK (quantity > 0)');
    expect(ddl).toContain('CONSTRAINT chk_loyalty_balance_non_negative CHECK (points_balance >= 0)');
    expect(ddl).toContain('CONSTRAINT chk_shifts_status CHECK (status IN (\'open\', \'closed\'))');

    // Verify indexes
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_sales_receipt_number ON sales(receipt_number)');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales(shift_id)');

    // Verify inventory automation trigger
    expect(ddl).toContain('trg_apply_inventory_movement');
    expect(ddl).toContain('trg_after_inventory_movement');
  });

  it('verifies Row Level Security (RLS) is enabled for all 21 tables in migration 2', () => {
    const rlsSql = fs.readFileSync(migration2Path, 'utf8');

    for (const table of requiredTables) {
      const rlsRegex = new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`, 'i');
      expect(rlsSql).toMatch(rlsRegex);
    }

    // Verify security helper functions
    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION auth_profile_id()');
    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION auth_profile_store_id()');
    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION is_admin()');
    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION is_manager_or_admin()');

    // Verify fine-grained store policies
    expect(rlsSql).toContain('CREATE POLICY "Users can read their assigned store"');
    expect(rlsSql).toContain('CREATE POLICY "Staff can view sales in their store"');
    expect(rlsSql).toContain('CREATE POLICY "Staff can insert sales in their store"');
  });

  it('verifies atomic offline sync RPC functions in migration 3', () => {
    const rpcSql = fs.readFileSync(migration3Path, 'utf8');

    expect(rpcSql).toContain('CREATE OR REPLACE FUNCTION ingest_pos_sale');
    expect(rpcSql).toContain('CREATE OR REPLACE FUNCTION reconcile_and_close_shift');

    // Verify idempotency check
    expect(rpcSql).toContain('SELECT id INTO v_existing_sale_id');
    expect(rpcSql).toContain('WHERE idempotency_key = (p_sale->>\'idempotency_key\')');
    expect(rpcSql).toContain('\'already_processed\'');
  });

  it('verifies production seed data contains required system roles and permissions and zero mock entities', () => {
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    // Essential system configuration must be present
    expect(seedSql).toContain('INSERT INTO roles');
    expect(seedSql).toContain('INSERT INTO permissions');
    expect(seedSql).toContain('INSERT INTO role_permissions');

    // Mock business data must be purged from production seed
    expect(seedSql).not.toContain('INSERT INTO sales');
    expect(seedSql).not.toContain('INSERT INTO sale_items');
    expect(seedSql).not.toContain('INSERT INTO products');
    expect(seedSql).not.toContain('INSERT INTO customers');
    expect(seedSql).not.toContain('INSERT INTO shifts');
  });

  describe('Dexie.js Offline Client Schema Parity', () => {
    beforeEach(async () => {
      await db.stores.clear();
      await db.roles.clear();
      await db.inventory.clear();
      await db.loyaltyAccounts.clear();
      await db.paymentItems.clear();
    });

    it('persists and queries store records offline in Dexie', async () => {
      const storeId = generateUUID();
      await db.stores.add({
        id: storeId,
        code: 'TEST-001',
        name: 'Offline Test Branch',
        tagline: 'Test',
        address: '123 Test St',
        phone: '+256 700 000000',
        tax_id: 'TIN-000',
        currency_code: 'UGX',
        currency_symbol: 'UGX',
        currency_decimals: 0,
        loyalty_rate: 0.001,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const retrieved = await db.stores.get(storeId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Offline Test Branch');
      expect(retrieved?.code).toBe('TEST-001');
    });

    it('persists inventory and split payment items offline in Dexie', async () => {
      const inventoryId = generateUUID();
      const storeId = generateUUID();
      const productId = generateUUID();

      await db.inventory.add({
        id: inventoryId,
        store_id: storeId,
        product_id: productId,
        quantity: 45.5,
        low_stock_threshold: 5,
        updated_at: new Date().toISOString(),
      });

      const inv = await db.inventory.get(inventoryId);
      expect(inv?.quantity).toBe(45.5);

      const paymentItemId = generateUUID();
      const paymentId = generateUUID();

      await db.paymentItems.add({
        id: paymentItemId,
        payment_id: paymentId,
        method: 'cash',
        amount_paid: 20000,
        change_given: 5000,
        created_at: new Date().toISOString(),
      });

      const pItem = await db.paymentItems.get(paymentItemId);
      expect(pItem?.amount_paid).toBe(20000);
      expect(pItem?.change_given).toBe(5000);
    });
  });
});
