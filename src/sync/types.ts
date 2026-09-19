export type SyncStage =
  | 'idle' // All caught up, no pending items
  | 'offline_pending' // Offline with pending items
  | 'syncing' // Actively syncing
  | 'synchronized' // Just completed synchronization
  | 'sync_failed'; // Sync encountered error, waiting to retry

export interface SyncTelemetry {
  stage: SyncStage;
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  currentIndex?: number;
  totalInBatch?: number;
  retryCount: number;
  nextRetrySeconds?: number;
  statusMessage: string;
  lastSyncedAt: string | null;
}

export type SyncTelemetryCallback = (telemetry: SyncTelemetry) => void;
