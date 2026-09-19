import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db, PosDatabase } from '../db';
import { SyncQueueItem } from '../types';
import { connectivityService } from '../services/connectivity';
import { syncQueue, SyncQueue } from './syncQueue';
import { conflictResolver, ConflictResolver } from './conflictResolver';
import { retryManager, RetryManager } from './retryManager';
import { SyncStage, SyncTelemetry, SyncTelemetryCallback } from './types';
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
  private legacySubscribers: Set<SyncProgressCallback> = new Set();
  private telemetrySubscribers: Set<SyncTelemetryCallback> = new Set();
  private lastSyncedAt: string | null = null;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private unsubscribeConnectivity: (() => void) | null = null;
  private unsubscribeRetryCountdown: (() => void) | null = null;

  private currentStage: SyncStage = 'idle';
  private currentTelemetryMessage: string = 'All transactions synchronized';
  private currentRetryCount: number = 0;
  private nextRetrySeconds: number = 0;
  private synchronizedClearTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly database: PosDatabase = db,
    private readonly queue: SyncQueue = syncQueue,
    private readonly resolver: ConflictResolver = conflictResolver,
    private readonly retrier: RetryManager = retryManager
  ) {
    this.initSupabase();

    // Listen to network status changes (transition from offline to online)
    let prevOnline = connectivityService.isOnline();
    this.unsubscribeConnectivity = connectivityService.subscribe(() => {
      const isOnline = connectivityService.isOnline();
      if (isOnline && !prevOnline) {
        this.retrier.cancelScheduledRetry();
        this.processQueue();
      } else if (!isOnline) {
        this.emitTelemetry();
      }
      prevOnline = isOnline;
    });

    // Listen to retry countdown ticks
    this.unsubscribeRetryCountdown = this.retrier.subscribeCountdown(seconds => {
      this.nextRetrySeconds = seconds;
      if (this.currentStage === 'sync_failed') {
        this.currentTelemetryMessage = `Sync paused (attempt ${this.currentRetryCount}) — Retrying in ${seconds}s…`;
        this.emitTelemetry();
      }
    });

    // Periodic auto-sync interval when online (every 30s)
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

  /**
   * Subscribe to fine-grained SyncTelemetry updates
   */
  public subscribeTelemetry(callback: SyncTelemetryCallback): () => void {
    this.telemetrySubscribers.add(callback);
    this.emitTelemetry();
    return () => this.telemetrySubscribers.delete(callback);
  }

  /**
   * Legacy subscriber for backwards compatibility with existing components
   */
  public subscribe(callback: SyncProgressCallback): () => void {
    this.legacySubscribers.add(callback);
    this.emitStats();
    return () => this.legacySubscribers.delete(callback);
  }

  /**
   * Notify sync engine that a new offline transaction was written to IndexedDB
   */
  public async notifyNewTransaction(): Promise<void> {
    if (!connectivityService.isOnline()) {
      await this.emitTelemetry();
      return;
    }
    // If online, schedule immediate batch process
    await this.processQueue();
  }

  /**
   * Cancel any pending retry timers and immediately trigger synchronization
   */
  public async retryNow(): Promise<{ processed: number; errors: number }> {
    this.retrier.cancelScheduledRetry();
    try {
      await this.database.syncQueue
        .where('status')
        .equals('failed')
        .modify({ status: 'pending' });
    } catch {
      // safe fallback
    }
    return this.processQueue();
  }

  /**
   * Generates formatted real-time status message based on state
   */
  private generateStatusMessage(
    stage: SyncStage,
    pendingCount: number,
    currentIndex?: number,
    totalInBatch?: number,
    retryCount?: number,
    retrySeconds?: number
  ): string {
    const isOnline = connectivityService.isOnline();

    if (!isOnline) {
      if (pendingCount > 0) {
        const noun = pendingCount === 1 ? 'transaction' : 'transactions';
        return `Offline — ${pendingCount} ${noun} waiting to sync`;
      }
      return 'Offline — All transactions synchronized';
    }

    if (stage === 'syncing') {
      const count = totalInBatch || pendingCount;
      if (currentIndex && count && count > 1) {
        return `Syncing transaction ${currentIndex} of ${count}…`;
      }
      return `Syncing ${count} transaction${count === 1 ? '' : 's'}…`;
    }

    if (stage === 'synchronized') {
      return 'All transactions synchronized';
    }

    if (stage === 'sync_failed') {
      const sec = retrySeconds || 0;
      return `Sync paused (attempt ${retryCount || 1}) — Retrying in ${sec}s…`;
    }

    if (pendingCount > 0) {
      const noun = pendingCount === 1 ? 'transaction' : 'transactions';
      return `${pendingCount} ${noun} waiting to sync`;
    }

    return 'All transactions synchronized';
  }

  /**
   * Broadcasts the current sync telemetry state across all subscribers
   */
  public async emitTelemetry(): Promise<void> {
    try {
      if (!this.database.isOpen()) {
        await this.database.open();
      }
      const { pendingCount, failedCount, syncedCount } = await this.queue.getStats();
      const isOnline = connectivityService.isOnline();

      // Determine pending transactions count for human-friendly messaging
      let displayTransactions = pendingCount;
      try {
        const pendingSales = await this.database.sales.where('sync_status').equals('pending').count();
        if (pendingSales > 0) {
          displayTransactions = pendingSales;
        } else {
          const saleQueueItems = await this.database.syncQueue
            .where('entity_type')
            .equals('sale')
            .and(i => i.status === 'pending')
            .count();
          if (saleQueueItems > 0) {
            displayTransactions = saleQueueItems;
          }
        }
      } catch {
        displayTransactions = pendingCount;
      }

      // Determine stage if not currently syncing or in active success hold
      let stage = this.currentStage;
      if (!this.isProcessing && stage !== 'sync_failed' && stage !== 'synchronized') {
        if (!isOnline && pendingCount > 0) {
          stage = 'offline_pending';
        } else if (pendingCount > 0) {
          stage = 'offline_pending';
        } else {
          stage = 'idle';
        }
      }

      if (stage !== 'synchronized' && stage !== 'sync_failed') {
        this.currentTelemetryMessage = this.generateStatusMessage(stage, displayTransactions);
      }

      const telemetry: SyncTelemetry = {
        stage,
        pendingCount: displayTransactions,
        syncedCount,
        failedCount,
        retryCount: this.currentRetryCount,
        nextRetrySeconds: this.nextRetrySeconds,
        statusMessage: this.currentTelemetryMessage,
        lastSyncedAt: this.lastSyncedAt,
      };

      this.telemetrySubscribers.forEach(cb => cb(telemetry));

      // Also notify legacy subscribers
      const stats: SyncStats = {
        pendingCount,
        syncedCount,
        failedCount,
        isSyncing: this.isProcessing,
        lastSyncedAt: this.lastSyncedAt,
      };
      this.legacySubscribers.forEach(cb => cb(stats));
    } catch {
      // Database may be closed during test teardown
      return;
    }
  }

  public async emitStats(): Promise<void> {
    return this.emitTelemetry();
  }

  /**
   * Main synchronization loop implementing the authoritative 8-step pipeline:
   * 1. Sale Created (IndexedDB)
   * 2. Enqueued in sync_queue (idempotency key)
   * 3. Internet available?
   * 4. Validate payload
   * 5. Send to Supabase
   * 6. Server idempotency check
   * 7. Commit confirmation
   * 8. Mark SYNCHRONIZED
   */
  public async processQueue(): Promise<{ processed: number; errors: number }> {
    if (this.isProcessing) {
      return { processed: 0, errors: 0 };
    }

    if (!this.database.isOpen()) {
      await this.database.open();
    }

    // Stage 3: Internet available?
    if (!connectivityService.isOnline()) {
      this.currentStage = 'offline_pending';
      await this.emitTelemetry();
      return { processed: 0, errors: 0 };
    }

    const batch = await this.queue.getNextBatch(50);
    if (batch.length === 0) {
      this.currentStage = 'idle';
      this.currentTelemetryMessage = 'All transactions synchronized';
      await this.emitTelemetry();
      return { processed: 0, errors: 0 };
    }

    this.isProcessing = true;
    this.currentStage = 'syncing';
    connectivityService.setSyncing(true);

    const saleCountInBatch = batch.filter(b => b.entity_type === 'sale').length;
    const displayBatchCount = saleCountInBatch > 0 ? saleCountInBatch : batch.length;
    this.currentTelemetryMessage = this.generateStatusMessage('syncing', displayBatchCount, 1, displayBatchCount);
    await this.emitTelemetry();

    let processedCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];

        if (!connectivityService.isOnline()) {
          this.currentStage = 'offline_pending';
          break;
        }

        // Update real-time progress message
        this.currentTelemetryMessage = this.generateStatusMessage('syncing', displayBatchCount, i + 1, displayBatchCount);
        await this.emitTelemetry();

        const success = await this.executePipelineForItem(item);
        if (success) {
          processedCount++;
        } else {
          errorCount++;
        }
      }

      if (errorCount === 0 && processedCount > 0) {
        // Stage 8: All transactions successfully synchronized
        this.lastSyncedAt = new Date().toISOString();
        this.currentStage = 'synchronized';
        this.currentTelemetryMessage = 'All transactions synchronized';
        this.currentRetryCount = 0;
        this.retrier.cancelScheduledRetry();

        // Hold the "All transactions synchronized" confirmation for 4 seconds
        if (this.synchronizedClearTimeout) clearTimeout(this.synchronizedClearTimeout);
        this.synchronizedClearTimeout = setTimeout(async () => {
          this.currentStage = 'idle';
          await this.emitTelemetry();
        }, 4000);
      } else if (errorCount > 0) {
        // Handle failure branch: retry_count + 1 -> wait backoff -> retry
        this.handleFailureLoop(errorCount);
      }
    } catch (err) {
      logger.error('SyncEngine', 'Sync queue worker encountered error', err);
      connectivityService.setSyncError();
      this.handleFailureLoop(1);
    } finally {
      this.isProcessing = false;
      connectivityService.setSyncing(false);
      await this.emitTelemetry();
    }

    return { processed: processedCount, errors: errorCount };
  }

  /**
   * Stage 4-8: Pipeline execution for a single mutation item
   */
  private async executePipelineForItem(item: SyncQueueItem): Promise<boolean> {
    try {
      await this.queue.markInProgress(item);

      // Stage 4: Validate payload integrity
      const payload = JSON.parse(item.payload);
      const validation = this.validatePayload(item, payload);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.error}`);
      }

      // Stage 5 & 6: Send to Supabase with server-side Idempotency check
      if (this.supabase) {
        await this.pushToSupabase(item, payload);
      } else {
        // Simulation mode: rapid transport delay
        await new Promise(r => setTimeout(r, 10));
      }

      // Stage 7 & 8: Commit & Mark SYNCHRONIZED
      await this.markLocalRecordSynced(item);
      await this.queue.markSuccess(item);

      // Audit Log
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
      // Stage 6 fallback: Check if conflict is already committed idempotently
      const resolution = this.resolver.resolveConflict(item, err);
      if (resolution.resolved && resolution.action === 'skip_duplicate') {
        logger.info('SyncEngine', `Conflict resolved by deduplication: ${resolution.details}`);
        await this.markLocalRecordSynced(item);
        await this.queue.markSuccess(item);
        return true;
      }

      logger.warn('SyncEngine', `Sync failed for ${item.entity_type} (${item.entity_id})`, err);
      await this.queue.markFailure(item, err);
      return false;
    }
  }

  /**
   * Stage 4: Validation helper
   */
  private validatePayload(item: SyncQueueItem, payload: any): { valid: boolean; error?: string } {
    if (!payload) return { valid: false, error: 'Empty payload' };
    if (!item.idempotency_key || item.idempotency_key.trim() === '') {
      return { valid: false, error: 'Missing required idempotency key' };
    }

    if (item.entity_type === 'sale') {
      const sale = payload?.sale || payload;
      if (!sale || !sale.id) {
        return { valid: false, error: 'Malformed sale payload: missing sale id' };
      }
    }
    return { valid: true };
  }

  /**
   * Failure loop: retry_count + 1 -> wait backoff -> retry
   */
  private handleFailureLoop(errorCount: number): void {
    this.currentRetryCount += 1;
    this.currentStage = 'sync_failed';

    const backoffMs = this.retrier.calculateBackoff(this.currentRetryCount);
    this.nextRetrySeconds = Math.round(backoffMs / 1000);
    this.currentTelemetryMessage = `Sync paused (${errorCount} failed) — Retrying in ${this.nextRetrySeconds}s…`;

    logger.warn(
      'SyncEngine',
      `Scheduling retry #${this.currentRetryCount} in ${this.nextRetrySeconds}s (${backoffMs}ms)`
    );

    this.retrier.scheduleRetry(async () => {
      if (connectivityService.isOnline()) {
        await this.processQueue();
      }
    }, backoffMs);
  }

  /**
   * Stage 5: Pushes payload to remote Supabase tables idempotently
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
        break;
      }

      case 'product': {
        const { sync_status: _sync_status, ...remoteProduct } = payload;
        const { error } = await this.supabase
          .from('products')
          .upsert(remoteProduct, { onConflict: 'id' });
        if (error) throw error;
        break;
      }

      case 'category': {
        const { sync_status: _sync_status, ...remoteCategory } = payload;
        const { error } = await this.supabase
          .from('categories')
          .upsert(remoteCategory, { onConflict: 'id' });
        if (error) throw error;
        break;
      }

      case 'inventory_movement': {
        const { error } = await this.supabase
          .from('inventory_movements')
          .upsert(payload, { onConflict: 'idempotency_key' });
        if (error) throw error;
        break;
      }

      case 'shift': {
        const { error } = await this.supabase
          .from('shifts')
          .upsert(payload, { onConflict: 'idempotency_key' });
        if (error) throw error;
        break;
      }

      case 'customer': {
        const { error } = await this.supabase
          .from('customers')
          .upsert(payload, { onConflict: 'id' });
        if (error) throw error;
        break;
      }

      case 'loyalty_transaction': {
        const { error } = await this.supabase
          .from('loyalty_transactions')
          .upsert(payload, { onConflict: 'idempotency_key' });
        if (error) throw error;
        break;
      }

      case 'receipt': {
        const { error } = await this.supabase
          .from('receipts')
          .upsert(payload, { onConflict: 'id' });
        if (error) throw error;
        break;
      }
    }
  }

  /**
   * Stage 8: Updates local primary store record status to synced
   */
  private async markLocalRecordSynced(item: SyncQueueItem): Promise<void> {
    const now = new Date().toISOString();
    if (item.entity_type === 'sale') {
      await this.database.sales.update(item.entity_id, {
        sync_status: 'synced',
        server_synced_at: now,
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
        const pendingMovements = await this.database.inventoryMovements
          .where('sync_status')
          .equals('pending')
          .toArray();

        const pendingDeltasByProduct = new Map<string, number>();
        for (const mov of pendingMovements) {
          const current = pendingDeltasByProduct.get(mov.product_id) || 0;
          pendingDeltasByProduct.set(mov.product_id, current + mov.quantity_delta);
        }

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
    if (this.unsubscribeRetryCountdown) {
      this.unsubscribeRetryCountdown();
      this.unsubscribeRetryCountdown = null;
    }
    if (this.synchronizedClearTimeout) {
      clearTimeout(this.synchronizedClearTimeout);
      this.synchronizedClearTimeout = null;
    }
    this.retrier.cancelScheduledRetry();
    this.legacySubscribers.clear();
    this.telemetrySubscribers.clear();
  }
}

export const syncEngine = new SyncEngine();
