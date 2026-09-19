import React, { useState, useEffect } from 'react';
import {
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { syncService, SyncTelemetry } from '../../services/syncService';
import { connectivityService } from '../../services/connectivity';

interface SyncBannerProps {
  onOpenSyncModal?: () => void;
}

export const SyncBanner: React.FC<SyncBannerProps> = ({ onOpenSyncModal }) => {
  const [telemetry, setTelemetry] = useState<SyncTelemetry>({
    stage: 'idle',
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    retryCount: 0,
    statusMessage: 'All transactions synchronized',
    lastSyncedAt: null,
  });
  const [isOnline, setIsOnline] = useState<boolean>(connectivityService.isOnline());
  const [isRetryingNow, setIsRetryingNow] = useState<boolean>(false);

  useEffect(() => {
    const unsubTelemetry = syncService.subscribeTelemetry(t => {
      setTelemetry(t);
    });
    const unsubConn = connectivityService.subscribe(() => {
      setIsOnline(connectivityService.isOnline());
    });

    return () => {
      unsubTelemetry();
      unsubConn();
    };
  }, []);

  const handleRetryNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRetryingNow(true);
    try {
      await syncService.retryNow();
    } finally {
      setIsRetryingNow(false);
    }
  };

  // Determine if banner should be visible
  // Visible if:
  // 1. We are offline (with or without pending)
  // 2. We are actively syncing
  // 3. We are in 'synchronized' success state
  // 4. We are in 'sync_failed' state
  // 5. There are pending items waiting to sync
  const shouldShow =
    !isOnline ||
    telemetry.stage === 'syncing' ||
    telemetry.stage === 'synchronized' ||
    telemetry.stage === 'sync_failed' ||
    telemetry.pendingCount > 0;

  if (!shouldShow) {
    return null;
  }

  // Visual Styles based on stage
  const getBannerStyles = () => {
    if (!isOnline && telemetry.stage !== 'syncing' && telemetry.stage !== 'synchronized') {
      return {
        wrapper: 'bg-amber-950/80 border-b border-amber-800/80 text-amber-200',
        iconWrapper: 'text-amber-400 bg-amber-900/50 border-amber-700',
        badge: 'bg-amber-900/60 text-amber-300 border border-amber-700',
        icon: <WifiOff className="w-4 h-4 text-amber-400" />,
      };
    }

    switch (telemetry.stage) {
      case 'syncing':
        return {
          wrapper: 'bg-sky-950/85 border-b border-sky-800/80 text-sky-200',
          iconWrapper: 'text-sky-400 bg-sky-900/50 border-sky-700',
          badge: 'bg-sky-900/60 text-sky-300 border border-sky-700',
          icon: <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />,
        };

      case 'synchronized':
        return {
          wrapper: 'bg-emerald-950/85 border-b border-emerald-800/80 text-emerald-200',
          iconWrapper: 'text-emerald-400 bg-emerald-900/50 border-emerald-700',
          badge: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
        };

      case 'sync_failed':
        return {
          wrapper: 'bg-rose-950/85 border-b border-rose-800/80 text-rose-200',
          iconWrapper: 'text-rose-400 bg-rose-900/50 border-rose-700',
          badge: 'bg-rose-900/60 text-rose-300 border border-rose-700',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
        };

      case 'offline_pending':
      default:
        return {
          wrapper: 'bg-amber-950/80 border-b border-amber-800/80 text-amber-200',
          iconWrapper: 'text-amber-400 bg-amber-900/50 border-amber-700',
          badge: 'bg-amber-900/60 text-amber-300 border border-amber-700',
          icon: <WifiOff className="w-4 h-4 text-amber-400" />,
        };
    }
  };

  const styles = getBannerStyles();

  return (
    <div
      onClick={onOpenSyncModal}
      className={`w-full py-2 px-4 flex items-center justify-between text-xs transition-colors duration-300 cursor-pointer shadow-md select-none ${styles.wrapper}`}
      role="status"
      aria-live="polite"
      title="Click to view full synchronization telemetry"
    >
      <div className="flex items-center gap-3">
        {/* State Icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm ${styles.iconWrapper}`}>
          {styles.icon}
        </div>

        {/* Status Message */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="font-extrabold tracking-wide text-[12px]">{telemetry.statusMessage}</span>
          <span className="hidden md:inline text-[11px] opacity-75">
            {telemetry.stage === 'syncing'
              ? '&bull; Atomic batch commit in progress'
              : telemetry.stage === 'synchronized'
              ? '&bull; All changes confirmed on server'
              : telemetry.stage === 'sync_failed'
              ? '&bull; Idempotency preserved in IndexedDB'
              : '&bull; Sales recorded safely in local database'}
          </span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        {telemetry.stage === 'sync_failed' && (
          <button
            type="button"
            onClick={handleRetryNow}
            disabled={isRetryingNow}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-100 border border-rose-600 text-[11px] font-bold transition shadow-sm"
          >
            <RotateCcw className={`w-3 h-3 ${isRetryingNow ? 'animate-spin' : ''}`} />
            <span>Retry Now</span>
          </button>
        )}

        {isOnline && telemetry.stage !== 'syncing' && telemetry.pendingCount > 0 && (
          <button
            type="button"
            onClick={handleRetryNow}
            disabled={isRetryingNow}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-800 hover:bg-sky-700 text-sky-100 border border-sky-600 text-[11px] font-bold transition shadow-sm"
          >
            <RefreshCw className={`w-3 h-3 ${isRetryingNow ? 'animate-spin' : ''}`} />
            <span>Sync Now</span>
          </button>
        )}

        {onOpenSyncModal && (
          <button
            type="button"
            onClick={onOpenSyncModal}
            className="flex items-center gap-0.5 text-[11px] font-semibold opacity-80 hover:opacity-100 hover:underline transition"
          >
            <span>Telemetry</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
