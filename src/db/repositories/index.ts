import { db } from '../database';
import { SalesRepository } from './salesRepository';
import { InventoryRepository } from './inventoryRepository';
import { ShiftRepository } from './shiftRepository';
import { CustomerRepository } from './customerRepository';
import { ProductRepository } from './productRepository';
import { SyncQueueRepository } from './syncQueueRepository';
import { AuditLogRepository } from './auditLogRepository';

export * from './baseRepository';
export * from './salesRepository';
export * from './inventoryRepository';
export * from './shiftRepository';
export * from './customerRepository';
export * from './productRepository';
export * from './syncQueueRepository';
export * from './auditLogRepository';

// Singleton instances bound to default PosDatabase
export const salesRepository = new SalesRepository(db);
export const inventoryRepository = new InventoryRepository(db);
export const shiftRepository = new ShiftRepository(db);
export const customerRepository = new CustomerRepository(db);
export const productRepository = new ProductRepository(db);
export const syncQueueRepository = new SyncQueueRepository(db);
export const auditLogRepository = new AuditLogRepository(db);
