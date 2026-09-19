import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db, PosDatabase } from '../db';
import { SyncQueueItem } from '../types';
import { connectivityService } from '../services/connectivity';
import { syncQueue, SyncQueue } from './syncQueue';
import { conflictResolver, ConflictResolver } from './conflictResolver';
import { logger } from '../utils/logger';

export interface SyncStats {
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncedAt: string | null;
}

export type SyncProgressCallback = (stats: SyncStats) => void;

export class SyncEngine {
  private supabase: SupabaseClient | null = null;
  private isProcessing = false;
  private subscribers: Set<SyncProgressCallback> = new Set();
  private lastSyncedAt: string | null = null;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private unsubscribeConnectivity: (() => void) | null = null;

  constructor(
    private readonly database: PosDatabase = db,
    private readonly queue: SyncQueue = syncQueue,
    private readonly resolver: ConflictResolver = conflictResolver
  ) {
    this.initSupabase();

    // Listen to network changes - trigger only on transition to online
    let prevStatus = connectivityService.getStatus();
    this.unsubscribeConnectivity = connectivityService.subscribe(status => {
      if (status === 'online' && prevStatus !== 'online') {
        this.processQueue();
      }
      prevStatus = status;
    });

    // Auto-sync interval every 30 seconds when online
    if (typeof window !== 'undefined') {
      this.syncIntervalId = setInterval(() => {
        if (connectivityService.isOnline() && !this.isProcessing) {
          this.processQueue();
        }
      }, 30000);
    }
  }

  public initSupabase(): void {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });
      } catch (e) {
        logger.warn('SyncEngine', 'Could not initialize Supabase client', e);
        this.supabase = null;
      }
    } else {
      this.supabase = null;
    }
  }

  public setSupabaseClient(client: SupabaseClient | null): void {
    this.supabase = client;
  }

  public getSupabaseClient(): SupabaseClient | null {
    return this.supabase;
  }

  public isCloudConnected(): boolean {
    return this.supabase !== null && connectivityService.isOnline();
  }

  public subscribe(callback: SyncProgressCallback): () => void {
    this.subscribers.add(callback);
    this.emitStats();
    return () => this.subscribers.delete(callback);
  }

  public async emitStats(): Promise<void> {
    if (!this.database.isOpen()) {
      await this.database.open();
    }
    const { pendingCount, failedCount, syncedCount } = await this.queue.getStats();

    const stats: SyncStats = {
      pendingCount,
      syncedCount,
      failedCount,
      isSyncing: this.isProcessing,
      lastSyncedAt: this.lastSyncedAt,
    };

    this.subscribers.forEach(cb => cb(stats));
  }

  /**
   * Main synchronization loop: processes pending offline queue items in FIFO order
   */
  public async processQueue(): Promise<{ processed: number; errors: number }> {
    if (this.isProcessing) {
      return { processed: 0, errors: 0 };
    }

    if (!this.database.isOpen()) {
      await this.database.open();
    }

    if (!connectivityService.isOnline()) {
      return { processed: 0, errors: 0 };
    }

    this.isProcessing = true;
    connectivityService.setSyncing(true);
    await this.emitStats();

    let processedCount = 0;
    let errorCount = 0;

    try {
      const pendingItems = await this.queue.getNextBatch(50);

      for (const item of pendingItems) {
        if (!connectivityService.isOnline()) break;

        const success = await this.syncItem(item);
        if (success) {
          processedCount++;
        } else {
          errorCount++;
        }
      }

      if (processedCount > 0) {
        this.lastSyncedAt = new Date().toISOString();
      }
    } catch (err) {
      logger.error('SyncEngine', 'Sync queue worker encountered error', err);
      connectivityService.setSyncError();
    } finally {
      this.isProcessing = false;
      connectivityService.setSyncing(false);
      await this.emitStats();
    }

    return { processed: processedCount, errors: errorCount };
  }

  /**
   * Sync a single item with idempotency and conflict resolution
   */
  private async syncItem(item: SyncQueueItem): Promise<boolean> {
    try {
      await this.queue.markInProgress(item);
      const payload = JSON.parse(item.payload);

      if (this.supabase) {
        await this.pushToSupabase(item, payload);
      } else {
        // Offline / demo simulation mode: rapid delay to simulate transport
        await new Promise(r => setTimeout(r, 5));
        await this.markLocalRecordSynced(item);
      }

      await this.queue.markSuccess(item);

      // Record audit log
      await this.database.auditLogs.add({
        user_id: 'system-sync',
        action: 'SYNC_SUCCESS',
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        details: `Idempotency key: ${item.idempotency_key}`,
        timestamp: new Date().toISOString(),
        sync_status: 'synced',
      });

      return true;
    } catch (err: unknown) {
      // Evaluate conflict resolution
      const resolution = this.resolver.resolveConflict(item, err);
      if (resolution.resolved && resolution.action === 'skip_duplicate') {
        logger.info('SyncEngine', `Conflict resolved by deduplication: ${resolution.details}`);
        await this.markLocalRecordSynced(item);
        await this.queue.markSuccess(item);
        return true;
      }

      logger.warn('SyncEngine', `Sync failed for ${item.entity_type} ${item.entity_id}`, err);
      await this.queue.markFailure(item, err);
      return false;
    }
  }

  /**
   * Pushes payload to remote Supabase tables idempotently
   */
  private async pushToSupabase(item: SyncQueueItem, payload: any): Promise<void> {
    if (!this.supabase) return;

    switch (item.entity_type) {
      case 'sale': {
        const { sale, items, payments } = payload;
        const { error: saleError } = await this.supabase
          .from('sales')
          .upsert(sale, { onConflict: 'idempotency_key' });
        if (saleError) throw saleError;

        if (items && items.length > 0) {
          const { error: itemsError } = await this.supabase
            .from('sale_items')
            .upsert(items, { onConflict: 'id' });
          if (itemsError) throw itemsError;
        }

        if (payments && payments.length > 0) {
          const { error: payError } = await this.supabase
            .from('payments')
            .upsert(payments, { onConflict: 'idempotency_key' });
          if (payError) throw payError;
        }

        await this.database.sales.update(item.entity_id, {
          sync_status: 'synced',
          server_synced_at: new Date().toISOString(),
        });
        break;
      }

      case 'product': {
        const { sync_status: _sync_status, ...remoteProduct } = payload;
        const { error } = await this.supabase
          .from('products')
          .upsert(remoteProduct, { onConflict: 'id' });
        if (error) throw error;

        await this.database.products.update(item.entity_id, {
          sync_status: 'synced',
        });
        break;
      }

      case 'category': {
        const { sync_status: _sync_status, ...remoteCategory } = payload;
        const { error } = await this.supabase
          .from('categories')
          .upsert(remoteCategory, { onConflict: 'id' });
        if (error) throw error;

        await this.database.categories.update(item.entity_id, {
          sync_status: 'synced',
        });
        break;
      }

      case 'inventory_movement': {
        const { error } = await this.supabase
          .from('inventory_movements')
          .upsert(payload, { onConflict: 'idempotency_key' });
        if (error) throw error;

        await this.database.inventoryMovements.update(item.entity_id, {
          sync_status: 'synced',
        });
        break;
      }

      case 'shift': {
        const { error } = await this.supabase
          .from('shifts')
          .upsert(payload, { onConflict: 'idempotency_key' });
        if (error) throw error;

        await this.database.shifts.update(item.entity_id, {
          sync_status: 'synced',
        });
        break;
      }

      case 'customer': {
        const { error } = await this.supabase
          .from('customers')
          .upsert(payload, { onConflict: 'id' });
        if (error) throw error;

        await this.database.customers.update(item.entity_id, {
          sync_status: 'synced',
        });
        break;
      }

      case 'loyalty_transaction': {
        const { error } = await this.supabase
          .from('loyalty_transactions')
          .upsert(payload, { onConflict: 'idempotency_key' });
        if (error) throw error;

        await this.database.loyaltyTransactions.update(item.entity_id, {
          sync_status: 'synced',
        });
        break;
      }

      case 'receipt': {
        await this.database.receipts.update(item.entity_id, {
          sync_status: 'synced',
        });
        break;
      }
    }
  }

  /**
   * Updates local primary store record status to synced
   */
  private async markLocalRecordSynced(item: SyncQueueItem): Promise<void> {
    if (item.entity_type === 'sale') {
      await this.database.sales.update(item.entity_id, {
        sync_status: 'synced',
        server_synced_at: new Date().toISOString(),
      });
    } else if (item.entity_type === 'product') {
      await this.database.products.update(item.entity_id, { sync_status: 'synced' });
    } else if (item.entity_type === 'category') {
      await this.database.categories.update(item.entity_id, { sync_status: 'synced' });
    } else if (item.entity_type === 'inventory_movement') {
      await this.database.inventoryMovements.update(item.entity_id, { sync_status: 'synced' });
    } else if (item.entity_type === 'shift') {
      await this.database.shifts.update(item.entity_id, { sync_status: 'synced' });
    } else if (item.entity_type === 'customer') {
      await this.database.customers.update(item.entity_id, { sync_status: 'synced' });
    } else if (item.entity_type === 'receipt') {
      await this.database.receipts.update(item.entity_id, { sync_status: 'synced' });
    } else if (item.entity_type === 'loyalty_transaction') {
      await this.database.loyaltyTransactions.update(item.entity_id, { sync_status: 'synced' });
    }
  }

  /**
   * Pull updated product catalog & categories down from Supabase to IndexedDB
   * Reconciles stock levels with pending un-synced local inventory movements.
   */
  public async pullUpdatesFromSupabase(): Promise<boolean> {
    if (!this.supabase || !connectivityService.isOnline()) {
      return false;
    }

    try {
      // 1. Pull Categories
      const { data: categories, error: catError } = await this.supabase
        .from('categories')
        .select('*');

      if (!catError && categories && categories.length > 0) {
        await this.database.categories.bulkPut(categories.map(c => ({ ...c, sync_status: 'synced' })));
      }

      // 2. Pull Products
      const { data: products, error: prodError } = await this.supabase
        .from('products')
        .select('*')
        .eq('is_active', true);

      if (!prodError && products && products.length > 0) {
        // Find any local pending inventory movements not yet pushed
        const pendingMovements = await this.database.inventoryMovements
          .where('sync_status')
          .equals('pending')
          .toArray();

        const pendingDeltasByProduct = new Map<string, number>();
        for (const mov of pendingMovements) {
          const current = pendingDeltasByProduct.get(mov.product_id) || 0;
          pendingDeltasByProduct.set(mov.product_id, current + mov.quantity_delta);
        }

        // Reconcile remote product stock with local pending deltas
        const reconciledProducts = products.map(p => {
          const localDelta = pendingDeltasByProduct.get(p.id) || 0;
          return {
            ...p,
            stock_quantity: Math.max(0, (p.stock_quantity ?? 0) + localDelta),
            sync_status: 'synced' as const,
          };
        });

        await this.database.products.bulkPut(reconciledProducts);
      }

      return true;
    } catch (err) {
      logger.warn('SyncEngine', 'Failed to pull updates from Supabase', err);
      return false;
    }
  }

  /**
   * Performs a complete bidirectional synchronization:
   * 1. Pushes all pending local changes (sales, products, categories, stock) to Supabase
   * 2. Pulls updated catalog from Supabase into IndexedDB
   */
  public async syncCatalog(): Promise<{ pushed: number; errors: number; pulled: boolean }> {
    const pushResult = await this.processQueue();
    const pullSuccess = await this.pullUpdatesFromSupabase();
    return {
      pushed: pushResult.processed,
      errors: pushResult.errors,
      pulled: pullSuccess,
    };
  }

  public destroy(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    if (this.unsubscribeConnectivity) {
      this.unsubscribeConnectivity();
      this.unsubscribeConnectivity = null;
    }
    this.subscribers.clear();
  }
}

export const syncEngine = new SyncEngine();
