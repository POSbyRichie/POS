import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { retryManager, RetryManager } from '../sync/retryManager';
import { conflictResolver } from '../sync/conflictResolver';
import { syncQueue } from '../sync/syncQueue';
import { syncEngine } from '../sync/syncEngine';
import { connectivityService } from '../services/connectivity';
import { SyncQueueItem } from '../types';

describe('Sync Subsystem Architecture (Queue, Retry, Conflict, Engine)', () => {
  beforeEach(async () => {
    connectivityService.setSimulatedOffline(false);
    connectivityService.setStatus('online');

    await Promise.all([
      db.syncQueue.clear(),
      db.syncErrors.clear(),
      db.sales.clear(),
      db.auditLogs.clear(),
    ]);
  });

  describe('RetryManager', () => {
    it('calculates exponential backoff with jitter bounds', () => {
      const customRetry = new RetryManager({
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        jitterFactor: 0.1, // +/- 10%
      });

      const delay1 = customRetry.calculateBackoff(1);
      // Attempt 1: 1000 * 2^0 = 1000. Jitter [900, 1100]
      expect(delay1).toBeGreaterThanOrEqual(900);
      expect(delay1).toBeLessThanOrEqual(1100);

      const delay3 = customRetry.calculateBackoff(3);
      // Attempt 3: 1000 * 2^2 = 4000. Jitter [3600, 4400]
      expect(delay3).toBeGreaterThanOrEqual(3600);
      expect(delay3).toBeLessThanOrEqual(4400);

      // Capped at maxDelay
      const delay10 = customRetry.calculateBackoff(10);
      expect(delay10).toBeLessThanOrEqual(11000);
    });

    it('rejects retries when max attempts exceeded or error is non-retryable', () => {
      expect(retryManager.shouldRetry(4, 5)).toBe(true);
      expect(retryManager.shouldRetry(5, 5)).toBe(false);

      // Non-retryable constraint error
      const constraintErr = new Error('null value in column "tax_id" violates not-null constraint');
      expect(retryManager.shouldRetry(1, 5, constraintErr)).toBe(false);

      // Retryable network timeout error
      const timeoutErr = new Error('Network request failed: timeout of 10000ms exceeded');
      expect(retryManager.shouldRetry(1, 5, timeoutErr)).toBe(true);
    });
  });

  describe('ConflictResolver', () => {
    it('detects duplicate key violation and resolves as skip_duplicate', () => {
      const item: SyncQueueItem = {
        id: 1,
        entity_type: 'sale',
        entity_id: 'sale-123',
        operation: 'INSERT',
        payload: '{}',
        idempotency_key: 'sale-idem-123',
        attempts: 1,
        max_attempts: 5,
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      const duplicateError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "sales_idempotency_key_key"',
      };

      const resolution = conflictResolver.resolveConflict(item, duplicateError);
      expect(resolution.resolved).toBe(true);
      expect(resolution.action).toBe('skip_duplicate');
      expect(resolution.details).toContain('already exists on remote server');
    });

    it('correctly resolves inventory relative delta changes', () => {
      const initialStock = 45;
      const soldQuantityDelta = -5;
      const reconciled = conflictResolver.mergeInventoryDelta(initialStock, soldQuantityDelta);
      expect(reconciled).toBe(40);
    });

    it('correctly merges loyalty points balances', () => {
      const currentPoints = 120;
      const earned = 15;
      const merged = conflictResolver.mergeLoyaltyPoints(currentPoints, earned);
      expect(merged).toBe(135);
    });
  });

  describe('SyncQueue & Dead Letter Handling', () => {
    it('enqueues mutations, processes batches, and routes exhausted retries to syncErrors', async () => {
      // Isolate queue unit test by keeping simulated offline so background engine doesn't race
      connectivityService.setSimulatedOffline(true);

      // 1. Enqueue an item with maxAttempts = 2
      const id = await syncQueue.enqueue({
        entityType: 'sale',
        entityId: 'sale-test-deadletter',
        operation: 'INSERT',
        payload: { test: true },
        idempotencyKey: 'idem-deadletter-1',
        maxAttempts: 2,
      });

      expect(id).toBeDefined();

      // 2. Fetch from queue
      const batch = await syncQueue.getNextBatch(10);
      expect(batch).toHaveLength(1);
      expect(batch[0].entity_id).toBe('sale-test-deadletter');

      // 3. Fail attempt 1
      await syncQueue.markFailure(batch[0], new Error('Network timeout'));
      let item = await db.syncQueue.get(id);
      expect(item?.attempts).toBe(1);
      expect(item?.status).toBe('pending'); // Can still retry

      // 4. Fail attempt 2 (exceeds maxAttempts)
      await syncQueue.markFailure(item!, new Error('Network timeout 2'));
      item = await db.syncQueue.get(id);
      expect(item?.attempts).toBe(2);
      expect(item?.status).toBe('failed'); // Exceeded max attempts

      // 5. Verify Dead Letter entry in syncErrors table
      const deadLetterItems = await db.syncErrors.toArray();
      expect(deadLetterItems).toHaveLength(1);
      expect(deadLetterItems[0].entity_id).toBe('sale-test-deadletter');
      expect(deadLetterItems[0].error_message).toBe('Network timeout 2');
      expect(deadLetterItems[0].resolved).toBe(false);
    });
  });

  describe('SyncEngine Orchestrator', () => {
    it('processes queued offline mutations and transitions local records to synced', async () => {
      connectivityService.setSimulatedOffline(false);
      connectivityService.setStatus('online');
      expect(connectivityService.isOnline()).toBe(true);

      // Create a local sale
      const now = new Date().toISOString();
      await db.sales.put({
        id: 'sale-engine-01',
        idempotency_key: 'sale-engine-key-01',
        receipt_number: 'REC-ENG-001',
        shift_id: 'shift-01',
        register_id: 'reg-01',
        cashier_id: 'cashier-01',
        subtotal: 10000,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: 10000,
        amount_paid: 10000,
        change_amount: 0,
        payment_method: 'cash',
        payment_status: 'paid',
        items_count: 1,
        sync_status: 'pending',
        created_at: now,
        updated_at: now,
      });

      // Enqueue to syncQueue
      await syncQueue.enqueue({
        entityType: 'sale',
        entityId: 'sale-engine-01',
        operation: 'INSERT',
        payload: {
          sale: { id: 'sale-engine-01', total_amount: 10000 },
          items: [],
          payments: [],
        },
        idempotencyKey: 'sale-engine-key-01',
      });

      // Queue should have 1 pending item
      const statsBefore = await syncQueue.getStats();
      expect(statsBefore.pendingCount).toBe(1);

      // Process queue via SyncEngine
      const { processed, errors } = await syncEngine.processQueue();
      expect(processed).toBe(1);
      expect(errors).toBe(0);

      // Verify queue item is marked synced
      const queueItem = await db.syncQueue.where('entity_id').equals('sale-engine-01').first();
      expect(queueItem?.status).toBe('synced');

      // Verify primary local sale record is marked synced
      const updatedSale = await db.sales.get('sale-engine-01');
      expect(updatedSale?.sync_status).toBe('synced');
      expect(updatedSale?.server_synced_at).toBeDefined();

      // Verify audit log
      const auditLogs = await db.auditLogs.where('action').equals('SYNC_SUCCESS').toArray();
      expect(auditLogs).toHaveLength(1);
    });
  });
});
