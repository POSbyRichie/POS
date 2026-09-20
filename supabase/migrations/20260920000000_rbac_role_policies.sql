-- Migration 20260920000000_rbac_role_policies.sql
-- Description: Enhanced Role-Based Access Control (RBAC) security policies, role helpers, and inventory manager authorization.

-- 1. Helper function for inventory management roles
CREATE OR REPLACE FUNCTION is_inventory_manager_or_admin()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() IN ('admin', 'manager', 'inventory_manager');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Update Categories Management Policy to include inventory_manager
DROP POLICY IF EXISTS "Managers and admins can manage categories" ON categories;
CREATE POLICY "Inventory managers, managers and admins can manage categories"
  ON categories FOR ALL TO authenticated
  USING ((store_id = auth_profile_store_id() AND is_inventory_manager_or_admin()) OR is_admin());

-- 3. Update Products Management Policy to include inventory_manager
DROP POLICY IF EXISTS "Managers and admins can manage products" ON products;
CREATE POLICY "Inventory managers, managers and admins can manage products"
  ON products FOR ALL TO authenticated
  USING ((store_id = auth_profile_store_id() AND is_inventory_manager_or_admin()) OR is_admin());

-- 4. Secure Inventory Movements: Restrict manual movements to inventory managers & admins,
-- while allowing sales-related decrement movements for cashiers.
DROP POLICY IF EXISTS "Staff can record inventory movements in their store" ON inventory_movements;
CREATE POLICY "Staff can record inventory movements in their store"
  ON inventory_movements FOR INSERT TO authenticated
  WITH CHECK (
    (store_id = auth_profile_store_id() AND (
      type = 'SALE' OR is_inventory_manager_or_admin()
    ))
    OR is_admin()
  );
