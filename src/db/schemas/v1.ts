/**
 * Antigravity POS IndexedDB Schema - Version 1
 * Defines store schemas and indexes for all 22 domain entities.
 */
export const schemaV1 = {
  stores: 'id, code, is_active',
  roles: 'id, name',
  permissions: 'id, category',
  rolePermissions: '[role_id+permission_id], role_id, permission_id',
  users: 'id, username, role, is_active',
  devices: 'id, register_id, is_authorized',
  registers: 'id, register_name, is_active',
  categories: 'id, slug, sync_status',
  products: 'id, sku, barcode, name, category_id, is_active, sync_status',
  inventory: 'id, store_id, product_id, [store_id+product_id]',
  inventoryMovements: 'id, idempotency_key, product_id, register_id, shift_id, reference_id, type, timestamp, sync_status',
  shifts: 'id, idempotency_key, register_id, cashier_id, status, opened_at, sync_status',
  sales: 'id, idempotency_key, receipt_number, shift_id, register_id, cashier_id, customer_id, sync_status, created_at',
  saleItems: 'id, sale_id, product_id, sku',
  payments: 'id, idempotency_key, sale_id, method, status, sync_status',
  paymentItems: 'id, payment_id, method',
  customers: 'id, name, phone, loyalty_number, sync_status',
  loyaltyAccounts: 'id, customer_id, tier',
  loyaltyTransactions: 'id, idempotency_key, customer_id, sale_id, type, sync_status',
  receipts: 'id, sale_id, receipt_number, sync_status',
  emailQueue: 'id, receipt_id, receipt_number, status, created_at',
  smsQueue: 'id, receipt_id, receipt_number, status, created_at',
  syncQueue: '++id, entity_type, entity_id, idempotency_key, status, created_at',
  syncErrors: '++id, entity_type, entity_id, resolved, created_at',
  auditLogs: '++id, user_id, action, timestamp',
  settings: 'key',
} as const;
