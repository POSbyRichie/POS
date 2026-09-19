import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { SyncQueueItem, SyncStatus } from '../../types';

export class SyncQueueRepository extends BaseRepository<SyncQueueItem, number> {
  constructor(private readonly db: PosDatabase) {
    super(db.syncQueue);
  }

  async enqueue(
    item: Omit<SyncQueueItem, 'id' | 'status' | 'attempts' | 'created_at'> & {
      attempts?: number;
      status?: SyncStatus;
    }
  ): Promise<number> {
    const now = new Date().toISOString();
    return this.add({
      ...item,
      attempts: item.attempts || 0,
      status: item.status || 'pending',
      created_at: now,
    });
  }

  async getPending(limit = 50): Promise<SyncQueueItem[]> {
    return this.db.syncQueue
      .where('status')
      .equals('pending')
      .limit(limit)
      .toArray();
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<SyncQueueItem | undefined> {
    return this.db.syncQueue.where('idempotency_key').equals(idempotencyKey).first();
  }

  async markInProgress(id: number): Promise<void> {
    const item = await this.get(id);
    await this.update(id, {
      status: 'in_progress',
      attempts: (item?.attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
    });
  }

  async markSuccess(id: number): Promise<void> {
    await this.update(id, {
      status: 'synced',
    });
  }

  async markFailed(id: number, error: string, isPermanent: boolean): Promise<void> {
    const item = await this.get(id);
    await this.update(id, {
      status: isPermanent ? 'failed' : 'pending',
      attempts: (item?.attempts || 0) + 1,
      error_message: error,
      last_attempt_at: new Date().toISOString(),
    });
  }

  async getQueueStats(): Promise<{ pending: number; failed: number; synced: number; inProgress: number }> {
    const [pending, failed, synced, inProgress] = await Promise.all([
      this.db.syncQueue.where('status').equals('pending').count(),
      this.db.syncQueue.where('status').equals('failed').count(),
      this.db.syncQueue.where('status').equals('synced').count(),
      this.db.syncQueue.where('status').equals('in_progress').count(),
    ]);

    return { pending, failed, synced, inProgress };
  }
}
