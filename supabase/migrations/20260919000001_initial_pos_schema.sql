-- Migration 20260919000001_initial_pos_schema.sql
-- Description: Core Schema for Offline-First Point of Sale (POS) System
-- Tables: stores, roles, permissions, role_permissions, profiles, registers, devices,
--         categories, products, inventory, inventory_movements, customers, loyalty_accounts,
--         loyalty_transactions, shifts, sales, sale_items, payments, payment_items,
--         receipts, sync_queue, audit_logs

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Utility Trigger Function for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Stores / Outlets / Branches
-- ============================================================================
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  tax_id TEXT NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'UGX',
  currency_symbol VARCHAR(10) NOT NULL DEFAULT 'UGX',
  currency_decimals SMALLINT NOT NULL DEFAULT 0,
  loyalty_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.001, -- e.g. 1 pt per 1,000 currency units
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_stores_code_not_empty CHECK (length(trim(code)) > 0),
  CONSTRAINT chk_stores_decimals CHECK (currency_decimals >= 0 AND currency_decimals <= 4)
);

CREATE TRIGGER trg_stores_updated_at
BEFORE UPDATE ON stores
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. Roles & Permissions (RBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, -- 'admin', 'manager', 'cashier', 'inventory_manager'
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY, -- 'sales:create', 'sales:refund', 'inventory:adjust', etc.
  name TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================================
-- 5. Profiles (Cashiers, Managers, Staff)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE, -- References auth.users(id) in live Supabase
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  pin_hash TEXT NOT NULL, -- PBKDF2/SHA-256 for local offline authentication
  salt TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_profiles_username_not_empty CHECK (length(trim(username)) >= 3)
);

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. Registers / Point of Sale Terminals
-- ============================================================================
CREATE TABLE IF NOT EXISTS registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  register_number VARCHAR(50) NOT NULL,
  register_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_registers_store_number UNIQUE (store_id, register_number)
);

CREATE TRIGGER trg_registers_updated_at
BEFORE UPDATE ON registers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 7. Devices (Hardware Enrolled Terminals)
-- ============================================================================
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, -- e.g. dev-pos-terminal-01 or UUID
  register_id UUID NOT NULL REFERENCES registers(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  fingerprint TEXT DEFAULT '',
  is_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. Categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color VARCHAR(20) DEFAULT '#0284c7',
  icon VARCHAR(50) DEFAULT 'package',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_categories_store_slug UNIQUE (store_id, slug)
);

CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 9. Products / Items Catalog
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100) NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cost_price BIGINT NOT NULL DEFAULT 0, -- Stored in integer minor units (e.g. cents / UGX)
  selling_price BIGINT NOT NULL,        -- Stored in integer minor units
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00, -- e.g. 18.00% VAT
  unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
  min_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 5.000,
  image_url TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_products_store_sku UNIQUE (store_id, sku),
  CONSTRAINT uq_products_store_barcode UNIQUE (store_id, barcode),
  CONSTRAINT chk_products_cost_non_negative CHECK (cost_price >= 0),
  CONSTRAINT chk_products_selling_non_negative CHECK (selling_price >= 0),
  CONSTRAINT chk_products_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100)
);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 10. Inventory (Per-Store Aggregated Stock Ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
  low_stock_threshold NUMERIC(12, 3) NOT NULL DEFAULT 5.000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_inventory_store_product UNIQUE (store_id, product_id)
);

CREATE TRIGGER trg_inventory_updated_at
BEFORE UPDATE ON inventory
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 11. Shifts (Cashier Work Sessions & Drawer Reconciliations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  register_id UUID NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
  cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'closed'
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_float BIGINT NOT NULL DEFAULT 0,
  closing_cash_actual BIGINT,
  closing_cash_expected BIGINT,
  variance BIGINT,
  total_sales BIGINT NOT NULL DEFAULT 0,
  transaction_count INT NOT NULL DEFAULT 0,
  cash_sales_total BIGINT NOT NULL DEFAULT 0,
  card_sales_total BIGINT NOT NULL DEFAULT 0,
  wallet_sales_total BIGINT NOT NULL DEFAULT 0,
  qr_sales_total BIGINT NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_shifts_status CHECK (status IN ('open', 'closed')),
  CONSTRAINT chk_shifts_opening_float CHECK (opening_float >= 0)
);

CREATE TRIGGER trg_shifts_updated_at
BEFORE UPDATE ON shifts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 12. Inventory Movements (Immutable Stock Movement Ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  register_id UUID REFERENCES registers(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL, -- 'RESTOCK', 'SALE', 'DAMAGE', 'RETURN', 'ADJUSTMENT', 'TRANSFER'
  quantity_delta NUMERIC(12, 3) NOT NULL, -- Can be negative or positive
  previous_quantity NUMERIC(12, 3) NOT NULL,
  new_quantity NUMERIC(12, 3) NOT NULL,
  reference_id TEXT, -- sale_id, return_id, purchase_order_no
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_inventory_movements_type CHECK (
    type IN ('RESTOCK', 'SALE', 'DAMAGE', 'RETURN', 'ADJUSTMENT', 'TRANSFER')
  ),
  CONSTRAINT chk_inventory_movements_delta CHECK (quantity_delta <> 0)
);

-- Trigger: Automatically update inventory quantity on new movement
CREATE OR REPLACE FUNCTION trg_apply_inventory_movement()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory (store_id, product_id, quantity, updated_at)
  VALUES (NEW.store_id, NEW.product_id, NEW.new_quantity, NOW())
  ON CONFLICT (store_id, product_id)
  DO UPDATE SET
    quantity = NEW.new_quantity,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_after_inventory_movement
AFTER INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION trg_apply_inventory_movement();

-- ============================================================================
-- 13. Customers
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(150),
  address TEXT DEFAULT '',
  loyalty_number VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_customers_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 14. Loyalty Accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  points_balance BIGINT NOT NULL DEFAULT 0,
  lifetime_points_earned BIGINT NOT NULL DEFAULT 0,
  lifetime_points_redeemed BIGINT NOT NULL DEFAULT 0,
  tier VARCHAR(30) NOT NULL DEFAULT 'standard', -- 'standard', 'silver', 'gold', 'platinum'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_loyalty_balance_non_negative CHECK (points_balance >= 0)
);

CREATE TRIGGER trg_loyalty_accounts_updated_at
BEFORE UPDATE ON loyalty_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 15. Sales (Authoritative Order Headers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  receipt_number VARCHAR(100) NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  register_id UUID NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  subtotal BIGINT NOT NULL,
  discount_amount BIGINT NOT NULL DEFAULT 0,
  tax_amount BIGINT NOT NULL DEFAULT 0,
  total_amount BIGINT NOT NULL,
  amount_paid BIGINT NOT NULL,
  change_amount BIGINT NOT NULL DEFAULT 0,
  payment_method VARCHAR(30) NOT NULL, -- 'cash', 'card', 'wallet', 'qr', 'split'
  payment_status VARCHAR(30) NOT NULL DEFAULT 'paid', -- 'paid', 'refunded', 'cancelled'
  items_count INT NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sales_total_non_negative CHECK (total_amount >= 0),
  CONSTRAINT chk_sales_payment_status CHECK (payment_status IN ('paid', 'refunded', 'cancelled')),
  CONSTRAINT chk_sales_payment_method CHECK (payment_method IN ('cash', 'card', 'wallet', 'qr', 'split'))
);

CREATE TRIGGER trg_sales_updated_at
BEFORE UPDATE ON sales
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 16. Sale Items (Line Item Details)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku VARCHAR(100) NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL,
  unit_price BIGINT NOT NULL,
  discount_amount BIGINT NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  total_price BIGINT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sale_items_qty_positive CHECK (quantity > 0),
  CONSTRAINT chk_sale_items_unit_price CHECK (unit_price >= 0),
  CONSTRAINT chk_sale_items_total CHECK (total_price >= 0)
);

-- ============================================================================
-- 17. Payments (Payment Header Record)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method VARCHAR(30) NOT NULL, -- 'cash', 'card', 'wallet', 'qr', 'split'
  amount BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'UGX',
  status VARCHAR(30) NOT NULL DEFAULT 'successful', -- 'successful', 'failed', 'refunded'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_payments_status CHECK (status IN ('successful', 'failed', 'refunded')),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
);

-- ============================================================================
-- 18. Payment Items (Split Tender Breakdown)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL, -- 'cash', 'card', 'wallet', 'qr'
  amount_paid BIGINT NOT NULL,
  change_given BIGINT NOT NULL DEFAULT 0,
  reference TEXT DEFAULT '',
  provider_response JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_payment_items_amount CHECK (amount_paid >= 0),
  CONSTRAINT chk_payment_items_change CHECK (change_given >= 0)
);

-- ============================================================================
-- 19. Receipts (Thermal & Digital Transcripts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
  receipt_number VARCHAR(100) NOT NULL UNIQUE,
  content_json JSONB NOT NULL,
  printed_at TIMESTAMPTZ,
  email_queued BOOLEAN NOT NULL DEFAULT FALSE,
  sms_queued BOOLEAN NOT NULL DEFAULT FALSE,
  email_recipient TEXT,
  sms_recipient TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 20. Loyalty Transactions (Immutable Points Audit Log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL, -- 'EARN', 'REDEEM', 'ADJUST'
  points_delta BIGINT NOT NULL,
  previous_points BIGINT NOT NULL,
  new_points BIGINT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_loyalty_tx_type CHECK (type IN ('EARN', 'REDEEM', 'ADJUST')),
  CONSTRAINT chk_loyalty_tx_delta CHECK (points_delta <> 0)
);

-- ============================================================================
-- 21. Sync Queue (Server-Side Ingestion and Dispatch Buffer)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_queue (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  register_id UUID REFERENCES registers(id) ON DELETE SET NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT NOT NULL,
  operation VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  payload JSONB NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'synced', 'failed'
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sync_queue_status CHECK (status IN ('pending', 'in_progress', 'synced', 'failed')),
  CONSTRAINT chk_sync_queue_operation CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- ============================================================================
-- 22. Audit Logs (Immutable Security & Compliance Event Log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45) DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 23. Performance Indexes
-- ============================================================================
-- Store Scoping Indexes
CREATE INDEX IF NOT EXISTS idx_registers_store_id ON registers(store_id);
CREATE INDEX IF NOT EXISTS idx_devices_register_id ON devices(register_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_store_id ON inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_shifts_store_id ON shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_store_id ON inventory_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_store_id ON sync_queue(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON audit_logs(store_id);

-- Product and Catalog Indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);

-- Shift and Sales Indexes
CREATE INDEX IF NOT EXISTS idx_shifts_cashier_id ON shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_shifts_register_id ON shifts(register_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_register_id ON sales(register_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_id ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_receipt_number ON sales(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- Payment Indexes
CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_payment_id ON payment_items(payment_id);

-- Loyalty Indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_sale_id ON loyalty_transactions(sale_id);

-- Sync and Audit Indexes
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
