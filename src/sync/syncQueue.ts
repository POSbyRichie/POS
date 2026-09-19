import { db, PosDatabase } from '../db';
import { SyncQueueItem, SyncStatus } from '../types';
import { retryManager } from './retryManager';
import { logger } from '../utils/logger';

export interface EnqueueParams {
  entityType: SyncQueueItem['entity_type'];
  entityId: string;
  operation: SyncQueueItem['operation'];
  payload: Record<string, unknown> | string;
  idempotencyKey: string;
  maxAttempts?: number;
}

export class SyncQueue {
  constructor(private readonly database: PosDatabase = db) {}

  /**
   * Enqueues a mutation to the persistent offline sync queue
   */
  async enqueue(params: EnqueueParams): Promise<number> {
    const { entityType, entityId, operation, payload, idempotencyKey, maxAttempts = 5 } = params;
    const now = new Date().toISOString();

    const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const id = await this.database.syncQueue.add({
      entity_type: entityType,
      entity_id: entityId,
      operation,
      payload: stringPayload,
      idempotency_key: idempotencyKey,
      attempts: 0,
      max_attempts: maxAttempts,
      status: 'pending',
      created_at: now,
    });

    logger.debug('SyncQueue', `Enqueued ${entityType} (${entityId}) with key ${idempotencyKey}`);
    return id;
  }

  /**
   * Retrieves pending sync queue items sorted by FIFO order
   */
  async getNextBatch(batchSize = 50): Promise<SyncQueueItem[]> {
    try {
      await this.database.syncQueue
        .where('status')
        .equals('in_progress')
        .modify({ status: 'pending' });
    } catch {
      // safe fallback
    }

    return this.database.syncQueue
      .where('status')
      .equals('pending')
      .limit(batchSize)
      .toArray();
  }

  /**
   * Marks item as actively processing
   */
  async markInProgress(item: SyncQueueItem): Promise<void> {
    if (!item.id) return;
    await this.database.syncQueue.update(item.id, {
      status: 'in_progress' as SyncStatus,
      last_attempt_at: new Date().toISOString(),
      attempts: (item.attempts || 0) + 1,
    });
  }

  /**
   * Marks item as successfully synced to cloud
   */
  async markSuccess(item: SyncQueueItem): Promise<void> {
    if (!item.id) return;
    await this.database.syncQueue.update(item.id, {
      status: 'synced' as SyncStatus,
    });
    logger.debug('SyncQueue', `Successfully synced ${item.entity_type} (${item.entity_id})`);
  }

  /**
   * Handles failure: updates retry count or sends to dead-letter sync_errors table
   */
  async markFailure(item: SyncQueueItem, error: unknown): Promise<void> {
    if (!item.id) return;
    const errorMsg = typeof error === 'string'
      ? error
      : (error as { message?: string })?.message || String(error);

    const newAttempts = (item.attempts || 0) + 1;
    const canRetry = retryManager.shouldRetry(newAttempts, item.max_attempts, error);

    const nextStatus: SyncStatus = canRetry ? 'pending' : 'failed';

    await this.database.syncQueue.update(item.id, {
      status: nextStatus,
      attempts: newAttempts,
      error_message: errorMsg,
      last_attempt_at: new Date().toISOString(),
    });

    if (!canRetry) {
      logger.warn('SyncQueue', `Item ${item.entity_type} (${item.entity_id}) exceeded max retries. Moved to dead letter.`);
      // Write to sync errors table for dead-letter analysis
      await this.database.syncErrors.add({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        idempotency_key: item.idempotency_key,
        error_message: errorMsg,
        payload: item.payload,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    }
  }

  /**
   * Queue counts by status
   */
  async getStats(): Promise<{ pendingCount: number; failedCount: number; syncedCount: number; inProgressCount: number }> {
    const [pendingCount, failedCount, syncedCount, inProgressCount] = await Promise.all([
      this.database.syncQueue.where('status').equals('pending').count(),
      this.database.syncQueue.where('status').equals('failed').count(),
      this.database.syncQueue.where('status').equals('synced').count(),
      this.database.syncQueue.where('status').equals('in_progress').count(),
    ]);

    return { pendingCount, failedCount, syncedCount, inProgressCount };
  }

  /**
   * Purge already synced items to keep local storage compact
   */
  async purgeSyncedItems(): Promise<number> {
    return this.database.syncQueue.where('status').equals('synced').delete();
  }
}

export const syncQueue = new SyncQueue();
