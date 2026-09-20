-- Production Baseline Seed for Point of Sale System
-- File: supabase/seed.sql
-- Contains ONLY immutable system configuration: Roles, Permissions, and Security Mappings.
-- ZERO mock products, fake customers, demo users, or test sales.

-- 1. System Roles
INSERT INTO roles (id, name, description, is_system) VALUES
('admin', 'Administrator', 'Full system access and multi-store configuration', TRUE),
('manager', 'Store Manager', 'Store management, shift overrides, inventory adjustments and reports', TRUE),
('cashier', 'POS Cashier', 'Point of sale checkout, register shift management, customer enrollment', TRUE),
('inventory_manager', 'Inventory Manager', 'Stock intake, supplier deliveries, damaged goods adjustment', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. System Permissions
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

-- 3. Role Permissions Mapping
INSERT INTO role_permissions (role_id, permission_id) VALUES
-- Admin (Full system access)
('admin', 'sales:create'), ('admin', 'sales:refund'), ('admin', 'sales:view'),
('admin', 'inventory:view'), ('admin', 'inventory:adjust'),
('admin', 'shifts:open'), ('admin', 'shifts:close'),
('admin', 'reports:view'), ('admin', 'settings:manage'), ('admin', 'users:manage'),

-- Manager (Operations & shifts)
('manager', 'sales:create'), ('manager', 'sales:refund'), ('manager', 'sales:view'),
('manager', 'inventory:view'), ('manager', 'inventory:adjust'),
('manager', 'shifts:open'), ('manager', 'shifts:close'),
('manager', 'reports:view'),

-- Cashier (Checkout & shift drawer)
('cashier', 'sales:create'), ('cashier', 'sales:view'),
('cashier', 'shifts:open'), ('cashier', 'shifts:close'),

-- Inventory Manager (Stock & movements)
('inventory_manager', 'inventory:view'), ('inventory_manager', 'inventory:adjust')
ON CONFLICT (role_id, permission_id) DO NOTHING;
