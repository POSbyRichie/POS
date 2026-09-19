import React, { useState, useEffect } from 'react';
import { Cloud, RefreshCw, AlertTriangle, Clock, X, History } from 'lucide-react';
import { db } from '../../db';
import { SyncQueueItem, SyncError, AuditLog } from '../../types';
import { syncService } from '../../services/syncService';
import { connectivityService } from '../../services/connectivity';

interface SyncStatusModalProps {
  onClose: () => void;
}

export const SyncStatusModal: React.FC<SyncStatusModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'errors' | 'audit'>('queue');
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    loadSyncData();
  }, []);

  const loadSyncData = async () => {
    const [queue, errors, logs] = await Promise.all([
      db.syncQueue.reverse().limit(50).toArray(),
      db.syncErrors.reverse().limit(50).toArray(),
      db.auditLogs.reverse().limit(50).toArray(),
    ]);
    setQueueItems(queue);
    setSyncErrors(errors);
    setAuditLogs(logs);
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    await syncService.processQueue();
    await loadSyncData();
    setIsSyncing(false);
  };

  const handleClearResolvedErrors = async () => {
    await db.syncErrors.clear();
    await loadSyncData();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Idempotent Synchronization Telemetry</h3>
              <p className="text-xs text-slate-400">
                Offline-First Queue &bull; Status:{' '}
                <span className="font-semibold text-slate-200 uppercase font-mono">
                  {connectivityService.getStatus()}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-sky-600/30"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-5 py-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'queue'
                ? 'border-sky-500 text-sky-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Sync Queue ({queueItems.length})
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={`px-5 py-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'errors'
                ? 'border-rose-500 text-rose-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Sync Errors ({syncErrors.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-5 py-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            Audit Log ({auditLogs.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'queue' && (
            <div className="space-y-2">
              {queueItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Sync queue is clean. All local offline transactions are synced!
                </div>
              ) : (
                queueItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-slate-800 text-slate-300">
                          {item.operation} {item.entity_type}
                        </span>
                        <span className="text-slate-500 font-mono text-[10px]">
                          ID: {item.entity_id.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono block truncate max-w-md">
                        Key: {item.idempotency_key}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === 'synced'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : item.status === 'failed'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {item.status.toUpperCase()} (att: {item.attempts || 0})
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {new Date(item.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="space-y-2">
              {syncErrors.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Zero sync errors recorded. Synchronization engine is performing optimally.
                </div>
              ) : (
                <>
                  <div className="flex justify-end pb-2">
                    <button
                      onClick={handleClearResolvedErrors}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-300 rounded-lg text-xs transition"
                    >
                      Clear Error History
                    </button>
                  </div>
                  {syncErrors.map(err => (
                    <div
                      key={err.id}
                      className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-xs space-y-1"
                    >
                      <div className="flex justify-between font-bold text-rose-300">
                        <span>{err.entity_type.toUpperCase()} SYNC FAILURE</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(err.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-rose-400">{err.error_message}</p>
                      <p className="text-[10px] text-slate-500 font-mono">Key: {err.idempotency_key}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">No audit logs recorded yet.</div>
              ) : (
                auditLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-2.5 bg-slate-950/50 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-200 block">{log.action}</span>
                      <span className="text-[11px] text-slate-400">{log.details}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
