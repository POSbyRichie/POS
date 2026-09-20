import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CloudOff, CheckCircle, AlertTriangle } from 'lucide-react';
import { connectivityService } from '../../services/connectivity';
import { syncService, SyncStats } from '../../services/syncService';
import { ConnectivityStatus } from '../../types';

interface OfflineIndicatorProps {
  onOpenSyncModal?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ onOpenSyncModal }) => {
  const [status, setStatus] = useState<ConnectivityStatus>(connectivityService.getStatus());
  const [syncStats, setSyncStats] = useState<SyncStats>({
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    isSyncing: false,
    lastSyncedAt: null,
  });

  useEffect(() => {
    const unsubConn = connectivityService.subscribe(newStatus => {
      setStatus(newStatus);
    });
    const unsubSync = syncService.subscribe(stats => {
      setSyncStats(stats);
    });

    return () => {
      unsubConn();
      unsubSync();
    };
  }, []);

  const handleManualSync = async () => {
    await syncService.processQueue();
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'online':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <Wifi className="w-3.5 h-3.5" />
            ONLINE
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/90 text-rose-300 border border-rose-800/80 shadow-sm animate-bounce-short">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <WifiOff className="w-3.5 h-3.5" />
            OFFLINE
          </span>
        );
      case 'reconnecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            RECONNECTING
          </span>
        );
      case 'syncing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-950/80 text-sky-300 border border-sky-800/60">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            SYNCING
          </span>
        );
      case 'sync_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-950/80 text-orange-300 border border-orange-800/60">
            <AlertTriangle className="w-3.5 h-3.5" />
            SYNC ERROR
          </span>
        );
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Status Pill */}
      {getStatusBadge()}

      {/* Pending Sync Badge */}
      <button
        onClick={onOpenSyncModal}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
        title="View pending sync items and errors"
      >
        {syncStats.pendingCount > 0 ? (
          <>
            <CloudOff className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-300 font-bold">{syncStats.pendingCount}</span>
            <span className="text-slate-400">pending sync</span>
          </>
        ) : (
          <>
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300">All Synced</span>
          </>
        )}
      </button>

      {/* Manual Sync Now Button */}
      {status === 'online' && syncStats.pendingCount > 0 && (
        <button
          onClick={handleManualSync}
          disabled={syncStats.isSyncing}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-sky-600 hover:bg-sky-500 text-white font-medium transition disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${syncStats.isSyncing ? 'animate-spin' : ''}`} />
          Sync Now
        </button>
      )}
    </div>
  );
};
