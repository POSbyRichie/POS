export type UserRole = 'admin' | 'manager' | 'cashier' | 'inventory_manager';

export type SyncStatus = 'synced' | 'pending' | 'in_progress' | 'failed';

export type PaymentMethod = 'cash' | 'card' | 'wallet' | 'qr' | 'split';

export type ShiftStatus = 'open' | 'closed';

export type SaleStatus = 'completed' | 'refunded' | 'cancelled';

export type InventoryMovementType = 'SALE' | 'RESTOCK' | 'DAMAGE' | 'RETURN' | 'ADJUSTMENT';

export type LoyaltyTransactionType = 'EARN' | 'REDEEM' | 'ADJUST';

export type ConnectivityStatus = 'online' | 'offline' | 'reconnecting' | 'syncing' | 'sync_error';

export interface User {
  id: string; // UUID
  username: string;
  full_name: string;
  role: UserRole;
  pin_hash: string; // Salted PBKDF2/SHA-256 hash for offline auth
  salt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string; // UUID
  device_name: string;
  register_id: string;
  is_authorized: boolean;
  enrolled_at: string;
  last_active_at: string;
}

export interface Register {
  id: string; // UUID
  register_name: string;
  branch_name: string;
  is_active: boolean;
}

export interface Category {
  id: string; // UUID
  name: string;
  slug: string;
  sync_status: SyncStatus;
  updated_at: string;
}

export interface Product {
  id: string; // UUID
  sku: string;
  barcode: string;
  name: string;
  description?: string;
  category_id: string;
  cost_price: number; // Stored in minor units / integer (e.g. 150000 for 1,500.00 or integer UGX)
  selling_price: number;
  tax_rate: number; // e.g. 18 for 18% VAT, 0 for tax exempt
  unit: string; // 'pcs', 'kg', 'box', etc.
  stock_quantity: number;
  min_stock_level: number;
  image_url?: string;
  is_active: boolean;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string; // UUID
  idempotency_key: string;
  product_id: string;
  register_id: string;
  shift_id?: string;
  type: InventoryMovementType;
  quantity_delta: number; // Negative for sales/damage, positive for restock/returns
  previous_quantity: number;
  new_quantity: number;
  reference_id?: string; // sale_id or PO number
  user_id: string;
  notes?: string;
  timestamp: string;
  sync_status: SyncStatus;
}

export interface Shift {
  id: string; // UUID
  idempotency_key: string;
  register_id: string;
  cashier_id: string;
  status: ShiftStatus;
  opened_at: string;
  closed_at?: string;
  opening_float: number; // in minor units
  closing_cash_actual?: number;
  closing_cash_expected?: number;
  variance?: number;
  total_sales: number;
  transaction_count: number;
  cash_sales_total: number;
  card_sales_total: number;
  wallet_sales_total: number;
  qr_sales_total: number;
  notes?: string;
  sync_status: SyncStatus;
}

export interface Customer {
  id: string; // UUID
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  loyalty_number?: string;
  loyalty_points: number;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyTransaction {
  id: string; // UUID
  idempotency_key: string;
  customer_id: string;
  sale_id: string;
  points_delta: number;
  previous_points: number;
  new_points: number;
  type: LoyaltyTransactionType;
  timestamp: string;
  sync_status: SyncStatus;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number; // in minor units
  discount_amount: number; // in minor units per item
  tax_rate: number;
  item_total: number; // (unit_price - discount_amount) * quantity
  note?: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  total_price: number;
}

export interface PaymentBreakdown {
  id: string;
  method: PaymentMethod;
  amount_paid: number;
  reference?: string;
}

export interface PaymentRecord {
  id: string; // UUID
  idempotency_key: string;
  sale_id: string;
  method: PaymentMethod;
  amount_paid: number;
  change_given: number;
  reference?: string;
  status: 'successful' | 'failed';
  timestamp: string;
  sync_status: SyncStatus;
}

export interface Sale {
  id: string; // UUID
  idempotency_key: string;
  receipt_number: string;
  shift_id: string;
  register_id: string;
  cashier_id: string;
  customer_id?: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_amount: number;
  payment_method: PaymentMethod;
  payment_status: 'paid' | 'refunded' | 'cancelled';
  items_count: number;
  notes?: string;
  sync_status: SyncStatus;
  server_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: string; // UUID
  sale_id: string;
  receipt_number: string;
  content_json: string; // Serialized Sale details with items, cashier, store info
  printed_at?: string;
  email_queued: boolean;
  sms_queued: boolean;
  email_recipient?: string;
  sms_recipient?: string;
  sync_status: SyncStatus;
  created_at: string;
}

export interface SyncQueueItem {
  id?: number;
  entity_type: 'sale' | 'shift' | 'inventory_movement' | 'customer' | 'loyalty_transaction' | 'receipt';
  entity_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string; // JSON
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  status: SyncStatus;
  last_attempt_at?: string;
  error_message?: string;
  created_at: string;
}

export interface SyncError {
  id?: number;
  entity_type: string;
  entity_id: string;
  idempotency_key: string;
  error_message: string;
  payload: string;
  created_at: string;
  resolved: boolean;
}

export interface AuditLog {
  id?: number;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details?: string;
  timestamp: string;
  sync_status: SyncStatus;
}

export interface AppSettings {
  key: string;
  value: string;
}

export interface StoreInfo {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  tax_id: string;
  currency_code: string; // 'UGX', 'USD', 'EUR', etc.
  currency_symbol: string; // 'UGX', '$', '€'
  currency_decimals: number; // 0 for UGX/JPY, 2 for USD/EUR
  loyalty_rate: number; // e.g. 1 point per 1000 minor units
}

export interface Store {
  id: string;
  code: string;
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email?: string;
  tax_id: string;
  currency_code: string;
  currency_symbol: string;
  currency_decimals: number;
  loyalty_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  name: string;
  category: string;
  description: string;
  created_at: string;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface Inventory {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  low_stock_threshold: number;
  updated_at: string;
}

export interface PaymentItem {
  id: string;
  payment_id: string;
  method: string;
  amount_paid: number;
  change_given: number;
  reference?: string;
  provider_response?: Record<string, unknown>;
  created_at: string;
}

export interface LoyaltyAccount {
  id: string;
  customer_id: string;
  points_balance: number;
  lifetime_points_earned: number;
  lifetime_points_redeemed: number;
  tier: string;
  created_at: string;
  updated_at: string;
}

