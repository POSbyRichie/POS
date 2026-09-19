import Dexie, { type Table } from 'dexie';
import {
  User,
  Role,
  Permission,
  RolePermission,
  Store,
  Device,
  Register,
  Category,
  Product,
  Inventory,
  InventoryMovement,
  Shift,
  Sale,
  SaleItem,
  PaymentRecord,
  PaymentItem,
  Customer,
  LoyaltyAccount,
  LoyaltyTransaction,
  Receipt,
  SyncQueueItem,
  SyncError,
  AuditLog,
  AppSettings,
} from '../types';

export class PosDatabase extends Dexie {
  stores!: Table<Store, string>;
  roles!: Table<Role, string>;
  permissions!: Table<Permission, string>;
  rolePermissions!: Table<RolePermission, [string, string]>;
  users!: Table<User, string>;
  devices!: Table<Device, string>;
  registers!: Table<Register, string>;
  categories!: Table<Category, string>;
  products!: Table<Product, string>;
  inventory!: Table<Inventory, string>;
  inventoryMovements!: Table<InventoryMovement, string>;
  shifts!: Table<Shift, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  payments!: Table<PaymentRecord, string>;
  paymentItems!: Table<PaymentItem, string>;
  customers!: Table<Customer, string>;
  loyaltyAccounts!: Table<LoyaltyAccount, string>;
  loyaltyTransactions!: Table<LoyaltyTransaction, string>;
  receipts!: Table<Receipt, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  syncErrors!: Table<SyncError, number>;
  auditLogs!: Table<AuditLog, number>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('AntigravityPosDB');

    this.version(1).stores({
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
      inventoryMovements: 'id, idempotency_key, product_id, register_id, shift_id, type, timestamp, sync_status',
      shifts: 'id, idempotency_key, register_id, cashier_id, status, opened_at, sync_status',
      sales: 'id, idempotency_key, receipt_number, shift_id, register_id, cashier_id, customer_id, sync_status, created_at',
      saleItems: 'id, sale_id, product_id, sku',
      payments: 'id, idempotency_key, sale_id, method, status, sync_status',
      paymentItems: 'id, payment_id, method',
      customers: 'id, name, phone, loyalty_number, sync_status',
      loyaltyAccounts: 'id, customer_id, tier',
      loyaltyTransactions: 'id, idempotency_key, customer_id, sale_id, type, sync_status',
      receipts: 'id, sale_id, receipt_number, sync_status',
      syncQueue: '++id, entity_type, entity_id, idempotency_key, status, created_at',
      syncErrors: '++id, entity_type, entity_id, resolved, created_at',
      auditLogs: '++id, user_id, action, timestamp',
      settings: 'key',
    });
  }
}

export const db = new PosDatabase();
