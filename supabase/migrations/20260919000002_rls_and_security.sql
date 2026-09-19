-- Migration 20260919000002_rls_and_security.sql
-- Description: Row Level Security (RLS) Policies and Security Helper Functions

-- 1. Security Helper Functions
CREATE OR REPLACE FUNCTION auth_profile_id()
RETURNS UUID AS $$
  SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_profile_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_profile_role()
RETURNS TEXT AS $$
  SELECT role_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_manager_or_admin()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() IN ('admin', 'manager');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- 2. Enable Row Level Security on All Tables
-- ============================================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Reference Tables Policies (roles, permissions, role_permissions)
-- ============================================================================
CREATE POLICY "Allow authenticated users to read roles"
  ON roles FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Allow admin to manage roles"
  ON roles FOR ALL TO authenticated USING (is_admin());

CREATE POLICY "Allow authenticated users to read permissions"
  ON permissions FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Allow admin to manage permissions"
  ON permissions FOR ALL TO authenticated USING (is_admin());

CREATE POLICY "Allow authenticated users to read role_permissions"
  ON role_permissions FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Allow admin to manage role_permissions"
  ON role_permissions FOR ALL TO authenticated USING (is_admin());

-- ============================================================================
-- 4. Stores Policies
-- ============================================================================
CREATE POLICY "Users can read their assigned store"
  ON stores FOR SELECT TO authenticated
  USING (id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Admins can manage all stores"
  ON stores FOR ALL TO authenticated
  USING (is_admin());

-- ============================================================================
-- 5. Profiles Policies
-- ============================================================================
CREATE POLICY "Users can read profiles in their store"
  ON profiles FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth_profile_id() OR is_admin());

CREATE POLICY "Admins and managers can manage profiles in store"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (store_id = auth_profile_store_id() AND is_manager_or_admin());

-- ============================================================================
-- 6. Registers and Devices Policies
-- ============================================================================
CREATE POLICY "Users can read registers in their store"
  ON registers FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Managers and admins can manage registers"
  ON registers FOR ALL TO authenticated
  USING ((store_id = auth_profile_store_id() AND is_manager_or_admin()) OR is_admin());

CREATE POLICY "Users can read devices for store registers"
  ON devices FOR SELECT TO authenticated
  USING (
    register_id IN (SELECT id FROM registers WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Managers and admins can manage devices"
  ON devices FOR ALL TO authenticated
  USING (
    (register_id IN (SELECT id FROM registers WHERE store_id = auth_profile_store_id()) AND is_manager_or_admin())
    OR is_admin()
  );

-- ============================================================================
-- 7. Categories and Products Policies
-- ============================================================================
CREATE POLICY "Users can read categories in their store"
  ON categories FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Managers and admins can manage categories"
  ON categories FOR ALL TO authenticated
  USING ((store_id = auth_profile_store_id() AND is_manager_or_admin()) OR is_admin());

CREATE POLICY "Users can read products in their store"
  ON products FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Managers and admins can manage products"
  ON products FOR ALL TO authenticated
  USING ((store_id = auth_profile_store_id() AND is_manager_or_admin()) OR is_admin());

-- ============================================================================
-- 8. Inventory & Inventory Movements Policies
-- ============================================================================
CREATE POLICY "Users can read inventory in their store"
  ON inventory FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Staff can read inventory movements in their store"
  ON inventory_movements FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Staff can record inventory movements in their store"
  ON inventory_movements FOR INSERT TO authenticated
  WITH CHECK (store_id = auth_profile_store_id() OR is_admin());

-- ============================================================================
-- 9. Customers & Loyalty Policies
-- ============================================================================
CREATE POLICY "Users can read customers in their store"
  ON customers FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Staff can create and update customers in their store"
  ON customers FOR ALL TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Users can read loyalty accounts"
  ON loyalty_accounts FOR SELECT TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Staff can manage loyalty accounts in their store"
  ON loyalty_accounts FOR ALL TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Staff can read and create loyalty transactions"
  ON loyalty_transactions FOR ALL TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

-- ============================================================================
-- 10. Shifts Policies
-- ============================================================================
CREATE POLICY "Cashiers can read their own shifts; managers can read all store shifts"
  ON shifts FOR SELECT TO authenticated
  USING (
    (store_id = auth_profile_store_id() AND (cashier_id = auth_profile_id() OR is_manager_or_admin()))
    OR is_admin()
  );

CREATE POLICY "Staff can create shifts in their store"
  ON shifts FOR INSERT TO authenticated
  WITH CHECK (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Staff can update their own open shifts; managers can close any shift"
  ON shifts FOR UPDATE TO authenticated
  USING (
    (store_id = auth_profile_store_id() AND (cashier_id = auth_profile_id() OR is_manager_or_admin()))
    OR is_admin()
  );

-- ============================================================================
-- 11. Sales, Sale Items, Payments, Payment Items, Receipts
-- ============================================================================
CREATE POLICY "Staff can view sales in their store"
  ON sales FOR SELECT TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Staff can insert sales in their store"
  ON sales FOR INSERT TO authenticated
  WITH CHECK (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Staff can view sale items in their store"
  ON sale_items FOR SELECT TO authenticated
  USING (
    sale_id IN (SELECT id FROM sales WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Staff can insert sale items in their store"
  ON sale_items FOR INSERT TO authenticated
  WITH CHECK (
    sale_id IN (SELECT id FROM sales WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Staff can view payments in their store"
  ON payments FOR SELECT TO authenticated
  USING (
    sale_id IN (SELECT id FROM sales WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Staff can insert payments in their store"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (
    sale_id IN (SELECT id FROM sales WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Staff can view payment items in their store"
  ON payment_items FOR SELECT TO authenticated
  USING (
    payment_id IN (
      SELECT p.id FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE s.store_id = auth_profile_store_id()
    )
    OR is_admin()
  );

CREATE POLICY "Staff can insert payment items in their store"
  ON payment_items FOR INSERT TO authenticated
  WITH CHECK (
    payment_id IN (
      SELECT p.id FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE s.store_id = auth_profile_store_id()
    )
    OR is_admin()
  );

CREATE POLICY "Staff can view receipts in their store"
  ON receipts FOR SELECT TO authenticated
  USING (
    sale_id IN (SELECT id FROM sales WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

CREATE POLICY "Staff can insert receipts in their store"
  ON receipts FOR INSERT TO authenticated
  WITH CHECK (
    sale_id IN (SELECT id FROM sales WHERE store_id = auth_profile_store_id())
    OR is_admin()
  );

-- ============================================================================
-- 12. Sync Queue & Audit Logs Policies
-- ============================================================================
CREATE POLICY "Staff can view and insert sync queue items for their store"
  ON sync_queue FOR ALL TO authenticated
  USING (store_id = auth_profile_store_id() OR is_admin());

CREATE POLICY "Managers and admins can view audit logs in their store"
  ON audit_logs FOR SELECT TO authenticated
  USING ((store_id = auth_profile_store_id() AND is_manager_or_admin()) OR is_admin());

CREATE POLICY "Staff can record audit logs for their store"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (store_id = auth_profile_store_id() OR is_admin());
