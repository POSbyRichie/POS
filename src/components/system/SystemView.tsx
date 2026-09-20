import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  Cloud,
  RefreshCw,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Trash2,
  Check,
} from 'lucide-react';
import { db } from '../../db';
import { SyncQueueItem, SyncError, AuditLog } from '../../types';
import { syncService, SyncTelemetry } from '../../services/syncService';
import { connectivityService } from '../../services/connectivity';

export type SystemActiveTab = 'offline_status' | 'sync_center' | 'sync_errors' | 'audit_logs';

export const SystemView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SystemActiveTab>('offline_status');
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(connectivityService.isOnline());
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);

  const [telemetry, setTelemetry] = useState<SyncTelemetry>({
    stage: 'idle',
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    retryCount: 0,
    statusMessage: 'All transactions synchronized',
    lastSyncedAt: null,
  });

  const loadData = useCallback(async () => {
    try {
      const [queue, errors, logs] = await Promise.all([
        db.syncQueue.reverse().limit(50).toArray(),
        db.syncErrors.reverse().limit(50).toArray(),
        db.auditLogs.reverse().limit(50).toArray(),
      ]);
      setQueueItems(queue);
      setSyncErrors(errors);
      setAuditLogs(logs);

      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        setStorageEstimate({
          usage: est.usage || 0,
          quota: est.quota || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load system view data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsubConn = connectivityService.subscribe(() => {
      setIsOnline(connectivityService.isOnline());
    });
    const unsubTelemetry = syncService.subscribeTelemetry(t => setTelemetry(t));

    return () => {
      unsubConn();
      unsubTelemetry();
    };
  }, [loadData]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    await syncService.processQueue();
    await loadData();
    setIsSyncing(false);
  };

  const handleClearErrors = async () => {
    await db.syncErrors.clear();
    await loadData();
  };

  const handleExportAuditLogs = () => {
    const json = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-sky-400" />
            <span>System Health &amp; Diagnostics</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Terminal status, sync queue monitor, error logs, and audit records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Queue...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('offline_status')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'offline_status'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
          <span>Terminal Status</span>
        </button>

        <button
          onClick={() => setActiveTab('sync_center')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'sync_center'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Cloud className="w-3.5 h-3.5 text-sky-400" />
          <span>Sync Center ({queueItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sync_errors')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'sync_errors'
              ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>Sync Errors ({syncErrors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit_logs')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'audit_logs'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-amber-400" />
          <span>Audit Logs ({auditLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: STATUS */}
      {activeTab === 'offline_status' && (
        <div className="space-y-6">
          {/* Status Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Connection State</span>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span className="text-lg font-bold text-white">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {isOnline ? 'Network synchronized' : 'Offline mode active'}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Sync Pipeline State</span>
              <span className="text-lg font-bold text-sky-400 mt-1 block uppercase font-mono">
                {telemetry.stage}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block truncate">
                {telemetry.statusMessage}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Pending Queue</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block font-mono">
                {telemetry.pendingCount}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">Awaiting cloud sync</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Local Database Usage</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block font-mono">
                {storageEstimate ? `${(storageEstimate.usage / 1024 / 1024).toFixed(2)} MB` : 'Available'}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">Local storage database</span>
            </div>
          </div>

          {/* Architecture Guarantee Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>Offline Architecture &amp; Data Protection</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Zero Network Dependency on Checkout:</strong> Completing a sale commits directly to local database transactions. No internet connection is required during payment.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Encrypted Local Storage:</strong> All sales, payments, items, customers, shifts, and sync records use secure, structured local storage.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Duplicate-Safe Sync Pipeline:</strong> Every transaction carries a unique identifier. Network interruptions during synchronization never produce duplicate records.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Multi-Terminal Stock Auditing:</strong> Inventory movements are tracked chronologically to keep stock records consistent across registers.
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 2: SYNC CENTER */}
      {activeTab === 'sync_center' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Synchronization Outbox Queue</span>
            <span className="text-[10px] text-slate-500 font-mono">{queueItems.length} records</span>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
            {queueItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Sync queue is empty. All local transactions are synchronized.
              </div>
            ) : (
              queueItems.map(item => (
                <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-sky-950 text-sky-400 border border-sky-800">
                        {item.entity_type}
                      </span>
                      <span className="font-bold text-white font-mono">{item.idempotency_key}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                          item.status === 'synced'
                            ? 'bg-emerald-950 text-emerald-400'
                            : item.status === 'failed'
                            ? 'bg-rose-950 text-rose-400'
                            : 'bg-amber-950 text-amber-400'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Op: {item.operation} &bull; Attempts: {item.attempts}/{item.max_attempts} &bull; Created:{' '}
                      {new Date(item.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-right text-[10px] text-slate-500 font-mono">
                    ID: {item.entity_id.slice(0, 8)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SYNC ERRORS */}
      {activeTab === 'sync_errors' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-4">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Sync Exceptions &amp; Error Log</span>
            {syncErrors.length > 0 && (
              <button
                onClick={handleClearErrors}
                className="flex items-center gap-1 text-rose-400 hover:text-rose-300 font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Resolved</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
            {syncErrors.length === 0 ? (
              <div className="p-8 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>No sync errors detected. All systems operating normally.</span>
              </div>
            ) : (
              syncErrors.map(err => (
                <div key={err.id} className="p-4 space-y-2 hover:bg-slate-800/30 transition text-xs">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-rose-950 text-rose-400 border border-rose-800">
                      {err.entity_type} &bull; {err.idempotency_key}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(err.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-rose-300 font-mono font-medium">{err.error_message}</p>
                  <div className="p-2 bg-slate-950 rounded-lg text-[10px] font-mono text-slate-400 truncate">
                    Payload: {err.payload}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === 'audit_logs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-4">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Immutable System Audit Trail</span>
            <button
              onClick={handleExportAuditLogs}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition border border-slate-700"
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Export JSON</span>
            </button>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No audit logs recorded yet.
              </div>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} className="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-slate-800 text-slate-300">
                        {log.action}
                      </span>
                      <span className="font-bold text-white">{log.entity_type} #{log.entity_id.slice(0, 8)}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      User: {log.user_id || 'system'} &bull; Details: {log.details ? JSON.stringify(log.details) : 'N/A'}
                    </span>
                  </div>

                  <div className="text-right text-[10px] text-slate-500 font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
