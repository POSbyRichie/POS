import React, { useState, useEffect } from 'react';
import {
  Cloud,
  RefreshCw,
  AlertTriangle,
  Clock,
  X,
  History,
  CheckCircle2,
  ArrowDown,
  Layers,
  ShieldCheck,
  Send,
  Database,
} from 'lucide-react';
import { db } from '../../db';
import { SyncQueueItem, SyncError, AuditLog } from '../../types';
import { syncService, SyncTelemetry } from '../../services/syncService';
import { connectivityService } from '../../services/connectivity';

interface SyncStatusModalProps {
  onClose: () => void;
}

export const SyncStatusModal: React.FC<SyncStatusModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'queue' | 'errors' | 'audit'>('pipeline');
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<SyncTelemetry>({
    stage: 'idle',
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    retryCount: 0,
    statusMessage: 'All transactions synchronized',
    lastSyncedAt: null,
  });

  useEffect(() => {
    loadSyncData();
    const unsubTelemetry = syncService.subscribeTelemetry(t => setTelemetry(t));
    return () => unsubTelemetry();
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

  const isOnline = connectivityService.isOnline();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Idempotent Synchronization Subsystem</h3>
              <p className="text-xs text-slate-400">
                Status: <span className="font-semibold text-slate-200 uppercase font-mono">{connectivityService.getStatus()}</span>
                {telemetry.pendingCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 text-[10px] font-bold border border-amber-800">
                    {telemetry.pendingCount} pending
                  </span>
                )}
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

        {/* Real-time Status Card */}
        <div className="bg-slate-950/60 px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Telemetry Message:</span>
            <span className="font-bold text-sky-300">{telemetry.statusMessage}</span>
          </div>
          {telemetry.lastSyncedAt && (
            <span className="text-slate-500 text-[11px]">
              Last synced: {new Date(telemetry.lastSyncedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-5 py-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'pipeline'
                ? 'border-sky-500 text-sky-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            Sync Pipeline Flow
          </button>
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
                ? 'border-sky-500 text-sky-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            Audit Log ({auditLogs.length})
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB: Pipeline Stepper */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
                <p className="font-semibold text-white mb-1">Local-to-Cloud Synchronization</p>
                <p className="text-[11px] text-slate-400">
                  Transactions are saved locally first, added to the outbound synchronization queue, and securely sent to the cloud when connected.
                </p>
              </div>

              {/* Visual Pipeline Stages */}
              <div className="grid grid-cols-1 gap-2 text-xs">
                {/* Stage 1 */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-bold text-white">1. Sale Saved Locally</span>
                      <p className="text-[10px] text-slate-400">Secure transaction written to local database</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    SAVED
                  </span>
                </div>

                <div className="flex justify-center text-slate-600 my-0.5">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>

                {/* Stage 2 */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <div>
                      <span className="font-bold text-white">2. Sync Outbox Queue</span>
                      <p className="text-[10px] text-slate-400">Unique identifier attached, ready for sync</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                    {telemetry.pendingCount} IN QUEUE
                  </span>
                </div>

                <div className="flex justify-center text-slate-600 my-0.5">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>

                {/* Stage 3 */}
                <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  isOnline
                    ? 'bg-emerald-950/30 border-emerald-800 text-emerald-200'
                    : 'bg-amber-950/40 border-amber-700 text-amber-200'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4" />
                    <div>
                      <span className="font-bold">3. Network Connection</span>
                      <p className="text-[10px] opacity-80">
                        {isOnline ? 'Online — connection verified' : 'Offline — transactions queued locally'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase">
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="flex justify-center text-slate-600 my-0.5">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>

                {/* Stage 4 */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-sky-400" />
                    <div>
                      <span className="font-bold text-white">4. Data Verification</span>
                      <p className="text-[10px] text-slate-400">Pre-sync format and integrity check</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">VALIDATED</span>
                </div>

                <div className="flex justify-center text-slate-600 my-0.5">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>

                {/* Stage 5 */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Send className="w-4 h-4 text-purple-400" />
                    <div>
                      <span className="font-bold text-white">5. Cloud Synchronization</span>
                      <p className="text-[10px] text-slate-400">Secure upload with duplicate prevention</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                    PROTECTED
                  </span>
                </div>

                <div className="flex justify-center text-slate-600 my-0.5">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>

                {/* Stage 6 */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-bold text-white">6. Sync Confirmation</span>
                      <p className="text-[10px] text-slate-400">Local and cloud records synchronized</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    COMPLETE
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Queue */}
          {activeTab === 'queue' && (
            <div className="space-y-3">
              {queueItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Sync queue is empty. All local changes are synced.
                </div>
              ) : (
                queueItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-200 capitalize">{item.entity_type}</span>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {item.entity_id}</span>
                        <span className="text-[10px] text-slate-500 font-mono">Key: {item.idempotency_key}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Attempts: {item.attempts}/{item.max_attempts} &bull; Created:{' '}
                        {new Date(item.created_at).toLocaleTimeString()}
                      </div>
                      {item.error_message && (
                        <div className="text-[10px] text-rose-400 mt-1 font-mono">{item.error_message}</div>
                      )}
                    </div>
                    <div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          item.status === 'synced'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : item.status === 'in_progress'
                            ? 'bg-sky-950 text-sky-400 border border-sky-800 animate-pulse'
                            : item.status === 'failed'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: Errors */}
          {activeTab === 'errors' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400">Sync exceptions requiring review</span>
                {syncErrors.length > 0 && (
                  <button
                    onClick={handleClearResolvedErrors}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                  >
                    Clear Resolved
                  </button>
                )}
              </div>
              {syncErrors.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">No sync errors logged. All records are up to date.</div>
              ) : (
                syncErrors.map(err => (
                  <div key={err.id} className="p-3.5 rounded-xl border border-rose-900/50 bg-rose-950/20 text-xs space-y-1">
                    <div className="flex justify-between font-bold text-rose-300">
                      <span>{err.entity_type} ({err.entity_id})</span>
                      <span>{new Date(err.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[11px] text-rose-200 font-mono break-all">{err.error_message}</p>
                    <div className="text-[10px] text-slate-500 font-mono">Key: {err.idempotency_key}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: Audit */}
          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">No sync audit logs recorded yet.</div>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="p-2.5 bg-slate-950/40 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-300 mr-2">{log.action}</span>
                      <span className="text-slate-500 font-mono text-[10px]">{log.entity_type} {log.entity_id}</span>
                      {log.details && <span className="text-slate-400 block text-[10px]">{log.details}</span>}
                    </div>
                    <span className="text-slate-500 text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
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
