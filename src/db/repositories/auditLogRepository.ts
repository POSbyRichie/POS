import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { AuditLog } from '../../types';

export class AuditLogRepository extends BaseRepository<AuditLog, number> {
  constructor(private readonly db: PosDatabase) {
    super(db.auditLogs);
  }

  async logEvent(entry: Omit<AuditLog, 'id' | 'timestamp' | 'sync_status'>): Promise<number> {
    return this.add({
      ...entry,
      timestamp: new Date().toISOString(),
      sync_status: 'pending',
    });
  }

  async getRecent(limit = 100): Promise<AuditLog[]> {
    return this.db.auditLogs.orderBy('id').reverse().limit(limit).toArray();
  }

  async getByUser(userId: string): Promise<AuditLog[]> {
    return this.db.auditLogs.where('user_id').equals(userId).toArray();
  }
}
