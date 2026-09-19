import { SupabaseClient } from '@supabase/supabase-js';
import { syncEngine, SyncEngine, SyncStats, SyncTelemetry, SyncStage } from '../sync';

export type { SyncStats, SyncTelemetry, SyncStage };

/**
 * Service adapter delegating to the modular syncEngine.
 * Preserves backwards compatibility for existing UI components and tests,
 * while exposing new real-time SyncTelemetry subscriptions.
 */
export class SyncService {
  private engine: SyncEngine;

  constructor(engine: SyncEngine = syncEngine) {
    this.engine = engine;
  }

  public initSupabase(): void {
    this.engine.initSupabase();
  }

  public setSupabaseClient(client: SupabaseClient | null): void {
    this.engine.setSupabaseClient(client);
  }

  public getSupabaseClient(): SupabaseClient | null {
    return this.engine.getSupabaseClient();
  }

  public isCloudConnected(): boolean {
    return this.engine.isCloudConnected();
  }

  public subscribe(callback: (stats: SyncStats) => void): () => void {
    return this.engine.subscribe(callback);
  }

  public subscribeTelemetry(callback: (telemetry: SyncTelemetry) => void): () => void {
    return this.engine.subscribeTelemetry(callback);
  }

  public async notifyNewTransaction(): Promise<void> {
    return this.engine.notifyNewTransaction();
  }

  public async retryNow(): Promise<{ processed: number; errors: number }> {
    return this.engine.retryNow();
  }

  public async processQueue(): Promise<{ processed: number; errors: number }> {
    return this.engine.processQueue();
  }

  public async pullUpdatesFromSupabase(): Promise<boolean> {
    return this.engine.pullUpdatesFromSupabase();
  }

  public async syncCatalog(): Promise<{ pushed: number; errors: number; pulled: boolean }> {
    return this.engine.syncCatalog();
  }

  public destroy(): void {
    this.engine.destroy();
  }
}

export const syncService = new SyncService(syncEngine);
