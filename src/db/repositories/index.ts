import { db } from '../database';
import { SalesRepository } from './salesRepository';
import { InventoryRepository } from './inventoryRepository';
import { ShiftRepository } from './shiftRepository';
import { CustomerRepository } from './customerRepository';
import { ProductRepository } from './productRepository';
import { CategoryRepository } from './categoryRepository';
import { SyncQueueRepository } from './syncQueueRepository';
import { AuditLogRepository } from './auditLogRepository';
import { LoyaltyRepository } from './loyaltyRepository';

export * from './baseRepository';
export * from './salesRepository';
export * from './inventoryRepository';
export * from './shiftRepository';
export * from './customerRepository';
export * from './productRepository';
export * from './categoryRepository';
export * from './syncQueueRepository';
export * from './auditLogRepository';
export * from './loyaltyRepository';

// Singleton instances bound to default PosDatabase
export const salesRepository = new SalesRepository(db);
export const inventoryRepository = new InventoryRepository(db);
export const shiftRepository = new ShiftRepository(db);
export const customerRepository = new CustomerRepository(db);
export const productRepository = new ProductRepository(db);
export const categoryRepository = new CategoryRepository(db);
export const syncQueueRepository = new SyncQueueRepository(db);
export const auditLogRepository = new AuditLogRepository(db);
export const loyaltyRepository = new LoyaltyRepository(db);
