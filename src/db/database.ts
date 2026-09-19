import Dexie, { type Table, type TransactionMode } from 'dexie';
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
  CashMovement,
  Sale,
  SaleItem,
  PaymentRecord,
  PaymentItem,
  Customer,
  LoyaltyAccount,
  LoyaltyTransaction,
  Receipt,
  EmailQueueItem,
  SmsQueueItem,
  SyncQueueItem,
  SyncError,
  AuditLog,
  AppSettings,
} from '../types';
import { DB_NAME } from './schemas';
import { applyMigrations } from './migrations';

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
  cashMovements!: Table<CashMovement, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  payments!: Table<PaymentRecord, string>;
  paymentItems!: Table<PaymentItem, string>;
  customers!: Table<Customer, string>;
  loyaltyAccounts!: Table<LoyaltyAccount, string>;
  loyaltyTransactions!: Table<LoyaltyTransaction, string>;
  receipts!: Table<Receipt, string>;
  emailQueue!: Table<EmailQueueItem, string>;
  smsQueue!: Table<SmsQueueItem, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  syncErrors!: Table<SyncError, number>;
  auditLogs!: Table<AuditLog, number>;
  settings!: Table<AppSettings, string>;

  constructor(databaseName: string = DB_NAME) {
    super(databaseName);
    applyMigrations(this);
  }

  /**
   * Helper to run an atomic transaction across a set of tables
   */
  async runTransaction<T>(
    mode: TransactionMode,
    tables: Table<any, any>[],
    scope: () => Promise<T>
  ): Promise<T> {
    return this.transaction(mode, tables, scope);
  }

  /**
   * Check whether the local database is open and healthy
   */
  isHealthy(): boolean {
    return this.isOpen();
  }
}

export const db = new PosDatabase();
