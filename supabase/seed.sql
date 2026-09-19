-- Seed Data for Point of Sale System
-- File: supabase/seed.sql

-- 1. Primary Store
INSERT INTO stores (id, code, name, tagline, address, phone, email, tax_id, currency_code, currency_symbol, currency_decimals, loyalty_rate)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'KLA-001',
  'Kampala Central Flagship',
  'Fresh Goods, Instant Service',
  'Plot 14 Kampala Road, Central Division, Kampala',
  '+256 700 123456',
  'store@posdarwin.com',
  'TIN-1002394857',
  'UGX',
  'UGX',
  0,
  0.0010
) ON CONFLICT (code) DO NOTHING;

-- 2. Roles
INSERT INTO roles (id, name, description, is_system) VALUES
('admin', 'Administrator', 'Full system access and multi-store configuration', TRUE),
('manager', 'Store Manager', 'Store management, shift overrides, inventory adjustments and reports', TRUE),
('cashier', 'POS Cashier', 'Point of sale checkout, register shift management, customer enrollment', TRUE),
('inventory_manager', 'Inventory Manager', 'Stock intake, supplier deliveries, damaged goods adjustment', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Permissions
INSERT INTO permissions (id, name, category, description) VALUES
('sales:create', 'Create Sales', 'sales', 'Scan products and tender transactions'),
('sales:refund', 'Refund Sales', 'sales', 'Process refunds and returns'),
('sales:view', 'View Sales', 'sales', 'View transaction receipts and history'),
('inventory:view', 'View Stock', 'inventory', 'Inspect real-time stock levels'),
('inventory:adjust', 'Adjust Stock', 'inventory', 'Perform stock adjustments and damaged goods entry'),
('shifts:open', 'Open Shifts', 'shifts', 'Open register work sessions with float'),
('shifts:close', 'Close Shifts', 'shifts', 'Count drawer cash and close shifts'),
('reports:view', 'View Reports', 'reports', 'Access financial and sales reconciliation reports'),
('settings:manage', 'Manage Settings', 'admin', 'Modify store settings and hardware configurations'),
('users:manage', 'Manage Staff', 'admin', 'Add and deactivate staff accounts')
ON CONFLICT (id) DO NOTHING;

-- 4. Role Permissions Mapping
INSERT INTO role_permissions (role_id, permission_id) VALUES
('admin', 'sales:create'), ('admin', 'sales:refund'), ('admin', 'sales:view'),
('admin', 'inventory:view'), ('admin', 'inventory:adjust'),
('admin', 'shifts:open'), ('admin', 'shifts:close'),
('admin', 'reports:view'), ('admin', 'settings:manage'), ('admin', 'users:manage'),
('manager', 'sales:create'), ('manager', 'sales:refund'), ('manager', 'sales:view'),
('manager', 'inventory:view'), ('manager', 'inventory:adjust'),
('manager', 'shifts:open'), ('manager', 'shifts:close'),
('manager', 'reports:view'),
('cashier', 'sales:create'), ('cashier', 'sales:view'),
('cashier', 'shifts:open'), ('cashier', 'shifts:close'),
('inventory_manager', 'inventory:view'), ('inventory_manager', 'inventory:adjust')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Profiles (Offline PIN Hashes precomputed for testing)
-- PIN 1234 -> Salt: salt1234, SHA256: 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
-- PIN 4321 -> Salt: salt4321, SHA256: b3413cf4b1f24d7cb0efb32e67dfab2a3c75dbf3dd3b6009a067ff506cf0ee05
INSERT INTO profiles (id, store_id, role_id, username, full_name, phone, pin_hash, salt, is_active) VALUES
(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'admin',
  'System Administrator',
  '+256 700 999999',
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  'salt1234',
  TRUE
),
(
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'manager',
  'smanager',
  'Sarah Namubiru (Manager)',
  '+256 700 888888',
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  'salt1234',
  TRUE
),
(
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001',
  'cashier',
  'rcashier',
  'Richie Okello (Cashier 1)',
  '+256 700 777777',
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  'salt1234',
  TRUE
),
(
  '00000000-0000-0000-0000-000000000013',
  '00000000-0000-0000-0000-000000000001',
  'cashier',
  'gkasule',
  'Grace Kasule (Cashier 2)',
  '+256 700 666666',
  'b3413cf4b1f24d7cb0efb32e67dfab2a3c75dbf3dd3b6009a067ff506cf0ee05',
  'salt4321',
  TRUE
) ON CONFLICT (username) DO NOTHING;

-- 6. Registers
INSERT INTO registers (id, store_id, register_number, register_name, is_active) VALUES
('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'REG-01', 'Main Counter Register 1', TRUE),
('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'REG-02', 'Express Checkout Register 2', TRUE)
ON CONFLICT (store_id, register_number) DO NOTHING;

-- 7. Devices
INSERT INTO devices (id, register_id, device_name, fingerprint, is_authorized, enrolled_at) VALUES
('dev-pos-terminal-01', '00000000-0000-0000-0000-000000000020', 'Counter POS iPad Pro', 'fp-ipad-kla-01', TRUE, NOW()),
('dev-pos-terminal-02', '00000000-0000-0000-0000-000000000021', 'Express POS Android Tablet', 'fp-android-kla-02', TRUE, NOW())
ON CONFLICT (id) DO NOTHING;

-- 8. Categories
INSERT INTO categories (id, store_id, name, slug, color, icon, sort_order) VALUES
('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'Beverages & Drinks', 'beverages', '#0284c7', 'coffee', 1),
('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'Bakery & Pastries', 'bakery', '#d97706', 'croissant', 2),
('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'Fresh Grocery', 'grocery', '#16a34a', 'apple', 3),
('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'Dairy & Eggs', 'dairy', '#9333ea', 'milk', 4)
ON CONFLICT (store_id, slug) DO NOTHING;

-- 9. Products Catalog (Prices in UGX minor units = integer)
INSERT INTO products (id, store_id, category_id, sku, barcode, name, description, cost_price, selling_price, tax_rate, unit, min_stock_level) VALUES
('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030', 'BEV-001', '600100100001', 'Highland Mineral Water 500ml', 'Natural pure mountain spring water bottle', 800, 1500, 18.00, 'pcs', 20.000),
('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030', 'BEV-002', '600100100002', 'Coca Cola 350ml Glass', 'Chilled carbonated soft drink', 1400, 2500, 18.00, 'pcs', 15.000),
('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030', 'BEV-003', '600100100003', 'Fresh Orange Juice 1L', '100% natural squeezed orange juice bottle', 5500, 9000, 18.00, 'pcs', 10.000),
('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'BAK-001', '600100100004', 'Artisan Sourdough Loaf 800g', 'Traditional crusty artisan sourdough bread', 4200, 7500, 0.00, 'pcs', 8.000),
('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'BAK-002', '600100100005', 'Butter Croissant', 'Flaky fresh European baked butter pastry', 2500, 4500, 18.00, 'pcs', 12.000),
('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'BAK-003', '600100100006', 'Chocolate Chip Muffin', 'Double chocolate rich bakery muffin', 2200, 4000, 18.00, 'pcs', 10.000),
('00000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000032', 'GRO-001', '600100100007', 'Sweet Yellow Bananas (1kg)', 'Locally grown sweet organic bananas', 2000, 3500, 0.00, 'kg', 15.000),
('00000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000032', 'GRO-002', '600100100008', 'Crisp Red Apples (1kg)', 'Imported fresh Washington gala apples', 7000, 12000, 0.00, 'kg', 10.000),
('00000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000032', 'GRO-003', '600100100009', 'Hass Avocado (Pair)', 'Creamy ripe farm avocados pack of 2', 2800, 5000, 0.00, 'box', 10.000),
('00000000-0000-0000-0000-000000000049', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000033', 'DAI-001', '600100100010', 'Fresh Farm Milk 1L Pouch', 'Pasteurized full cream whole milk', 2200, 3800, 0.00, 'pcs', 25.000),
('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000033', 'DAI-002', '600100100011', 'Plain Greek Yogurt 500g', 'Thick creamy natural probiotic yogurt', 5000, 8500, 18.00, 'pcs', 10.000),
('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000033', 'DAI-003', '600100100012', 'Farm Fresh Brown Eggs (Tray of 30)', 'Grade A free-range brown eggs tray', 11000, 18000, 0.00, 'box', 8.000)
ON CONFLICT (store_id, sku) DO NOTHING;

-- 10. Initial Inventory Movements & Quantities
INSERT INTO inventory_movements (id, idempotency_key, store_id, product_id, register_id, type, quantity_delta, previous_quantity, new_quantity, reference_id, user_id, notes) VALUES
(gen_random_uuid(), 'seed-restock-bev-001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 100.000, 0.000, 100.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Opening warehouse stock intake'),
(gen_random_uuid(), 'seed-restock-bev-002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 80.000, 0.000, 80.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Opening warehouse stock intake'),
(gen_random_uuid(), 'seed-restock-bev-003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 40.000, 0.000, 40.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Opening warehouse stock intake'),
(gen_random_uuid(), 'seed-restock-bak-001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 35.000, 0.000, 35.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Opening bakery delivery'),
(gen_random_uuid(), 'seed-restock-bak-002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 50.000, 0.000, 50.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Opening bakery delivery'),
(gen_random_uuid(), 'seed-restock-bak-003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 40.000, 0.000, 40.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Opening bakery delivery'),
(gen_random_uuid(), 'seed-restock-gro-001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 60.000, 0.000, 60.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Fresh farm morning delivery'),
(gen_random_uuid(), 'seed-restock-gro-002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 45.000, 0.000, 45.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Fresh farm morning delivery'),
(gen_random_uuid(), 'seed-restock-gro-003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 30.000, 0.000, 30.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Fresh farm morning delivery'),
(gen_random_uuid(), 'seed-restock-dai-001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000049', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 80.000, 0.000, 80.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Cold chain dairy delivery'),
(gen_random_uuid(), 'seed-restock-dai-002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 30.000, 0.000, 30.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Cold chain dairy delivery'),
(gen_random_uuid(), 'seed-restock-dai-003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000020', 'RESTOCK', 25.000, 0.000, 25.000, 'PO-2026-001', '00000000-0000-0000-0000-000000000010', 'Farm eggs delivery')
ON CONFLICT (idempotency_key) DO NOTHING;

-- 11. Customers
INSERT INTO customers (id, store_id, name, phone, email, address, loyalty_number) VALUES
('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', 'Grace Mukasa', '+256 701 112233', 'grace.mukasa@example.com', 'Nakasero Hill Road 12', 'LOY-1001'),
('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', 'David Kigozi', '+256 772 445566', 'david.kigozi@example.com', 'Kololo Terrace 4B', 'LOY-1002'),
('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001', 'Brenda Nalubega', '+256 750 778899', 'brenda.n@example.com', 'Bugolobi Village Plaza', 'LOY-1003'),
('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000001', 'General Store Walk-in Customer', '', '', 'In-store', '')
ON CONFLICT (id) DO NOTHING;

-- 12. Loyalty Accounts
INSERT INTO loyalty_accounts (id, customer_id, points_balance, lifetime_points_earned, tier) VALUES
('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060', 145, 145, 'standard'),
('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000061', 320, 320, 'silver'),
('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000062', 85, 85, 'standard')
ON CONFLICT (customer_id) DO NOTHING;

-- 13. Shifts
INSERT INTO shifts (
  id, idempotency_key, store_id, register_id, cashier_id, status, opened_at, closed_at,
  opening_float, closing_cash_actual, closing_cash_expected, variance, total_sales,
  transaction_count, cash_sales_total, card_sales_total, wallet_sales_total, qr_sales_total, notes
) VALUES
(
  '00000000-0000-0000-0000-000000000080',
  'seed-shift-yesterday-01',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000012',
  'closed',
  NOW() - INTERVAL '1 day 8 hours',
  NOW() - INTERVAL '1 day',
  100000, -- 100,000 UGX float
  165000,
  165000,
  0,
  115000,
  4,
  65000,
  35000,
  15000,
  0,
  'Balanced drawer perfectly at shift handover'
),
(
  '00000000-0000-0000-0000-000000000081',
  'seed-shift-today-active',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000012',
  'open',
  NOW() - INTERVAL '2 hours',
  NULL,
  100000,
  NULL,
  NULL,
  NULL,
  0,
  0,
  0,
  0,
  0,
  0,
  'Active morning shift'
)
ON CONFLICT (idempotency_key) DO NOTHING;

-- 14. Sample Completed Sale & Items
INSERT INTO sales (
  id, idempotency_key, receipt_number, store_id, register_id, shift_id, cashier_id, customer_id,
  subtotal, discount_amount, tax_amount, total_amount, amount_paid, change_amount,
  payment_method, payment_status, items_count, notes, created_at
) VALUES (
  '00000000-0000-0000-0000-000000000090',
  'seed-sale-demo-001',
  'REC-KLA-2026-0001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000080',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000060',
  16000,
  1000,
  2288,
  15000,
  20000,
  5000,
  'cash',
  'paid',
  3,
  'Member customer loyalty redemption discount applied',
  NOW() - INTERVAL '1 day 4 hours'
) ON CONFLICT (receipt_number) DO NOTHING;

INSERT INTO sale_items (id, sale_id, product_id, sku, product_name, quantity, unit_price, discount_amount, tax_rate, total_price) VALUES
('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000040', 'BEV-001', 'Highland Mineral Water 500ml', 2.000, 1500, 0, 18.00, 3000),
('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000044', 'BAK-002', 'Butter Croissant', 2.000, 4500, 1000, 18.00, 8000),
('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000048', 'GRO-003', 'Hass Avocado (Pair)', 1.000, 5000, 0, 0.00, 5000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (id, idempotency_key, sale_id, payment_method, amount, currency, status) VALUES
('00000000-0000-0000-0000-000000000094', 'seed-pay-demo-001', '00000000-0000-0000-0000-000000000090', 'cash', 15000, 'UGX', 'successful')
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO payment_items (id, payment_id, method, amount_paid, change_given, reference) VALUES
('00000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000094', 'cash', 20000, 5000, 'Physical drawer tender')
ON CONFLICT (id) DO NOTHING;

INSERT INTO receipts (id, sale_id, receipt_number, content_json, printed_at, email_queued, sms_queued) VALUES
(
  '00000000-0000-0000-0000-000000000096',
  '00000000-0000-0000-0000-000000000090',
  'REC-KLA-2026-0001',
  '{"store_name":"Kampala Central Flagship","receipt_number":"REC-KLA-2026-0001","total":15000,"cashier":"Richie Okello"}'::jsonb,
  NOW() - INTERVAL '1 day 4 hours',
  FALSE,
  FALSE
) ON CONFLICT (receipt_number) DO NOTHING;

-- 15. Initial Audit Log
INSERT INTO audit_logs (user_id, store_id, action, entity_type, entity_id, details) VALUES
('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'system:initialized', 'store', '00000000-0000-0000-0000-000000000001', '{"message":"Initial store catalog and hardware enrolled"}'::jsonb);
