import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Trash2,
  AlertCircle,
  Clock,
  Send,
} from 'lucide-react';
import { EmailQueueItem, SmsQueueItem } from '../../types';
import { notificationQueueService } from '../../services/notificationQueueService';

export const NotificationQueuesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'email' | 'sms'>('email');
  const [emailItems, setEmailItems] = useState<EmailQueueItem[]>([]);
  const [smsItems, setSmsItems] = useState<SmsQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [stats, setStats] = useState<{
    pendingEmails: number;
    sentEmails: number;
    failedEmails: number;
    pendingSms: number;
    sentSms: number;
    failedSms: number;
  }>({
    pendingEmails: 0,
    sentEmails: 0,
    failedEmails: 0,
    pendingSms: 0,
    sentSms: 0,
    failedSms: 0,
  });

  const loadData = useCallback(async () => {
    try {
      const [emails, sms, queueStats] = await Promise.all([
        notificationQueueService.getEmailQueue(),
        notificationQueueService.getSmsQueue(),
        notificationQueueService.getQueueStats(),
      ]);
      setEmailItems(emails);
      setSmsItems(sms);
      setStats(queueStats);
    } catch (err) {
      console.error('Failed to load notification queues:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleProcessQueues = async () => {
    setIsProcessing(true);
    try {
      await notificationQueueService.processQueues();
      await loadData();
    } catch (err) {
      console.error('Error processing queues:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = async (type: 'email' | 'sms', id: string) => {
    try {
      await notificationQueueService.retryQueueItem(type, id);
      await loadData();
    } catch (err) {
      console.error('Error retrying item:', err);
    }
  };

  const handleClearSent = async () => {
    try {
      await notificationQueueService.clearSentItems();
      await loadData();
    } catch (err) {
      console.error('Error clearing sent items:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div>
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-sky-400" />
            <span>Digital Receipt Dispatch Queues</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Offline-first asynchronous dispatch engine for email &amp; SMS receipts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleProcessQueues}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-sky-600/30 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>{isProcessing ? 'Dispatching...' : 'Process Queues Now'}</span>
          </button>

          <button
            type="button"
            onClick={handleClearSent}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition border border-slate-700"
            title="Clean up successfully sent items"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Sent</span>
          </button>
        </div>
      </div>

      {/* Tabs & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Email Tab Card */}
        <button
          type="button"
          onClick={() => setActiveTab('email')}
          className={`p-4 rounded-2xl border text-left transition flex items-center justify-between ${
            activeTab === 'email'
              ? 'bg-sky-950/40 border-sky-600'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-900/50 flex items-center justify-center text-sky-400 border border-sky-700">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-300 block">Email Queue</span>
              <span className="text-lg font-black text-white font-mono">{emailItems.length}</span>
            </div>
          </div>
          <div className="flex gap-2 text-[10px] font-bold font-mono">
            <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
              {stats.pendingEmails} Queued
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
              {stats.sentEmails} Sent
            </span>
            {stats.failedEmails > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800">
                {stats.failedEmails} Failed
              </span>
            )}
          </div>
        </button>

        {/* SMS Tab Card */}
        <button
          type="button"
          onClick={() => setActiveTab('sms')}
          className={`p-4 rounded-2xl border text-left transition flex items-center justify-between ${
            activeTab === 'sms'
              ? 'bg-purple-950/40 border-purple-600'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-900/50 flex items-center justify-center text-purple-400 border border-purple-700">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-300 block">SMS Queue</span>
              <span className="text-lg font-black text-white font-mono">{smsItems.length}</span>
            </div>
          </div>
          <div className="flex gap-2 text-[10px] font-bold font-mono">
            <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
              {stats.pendingSms} Queued
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
              {stats.sentSms} Sent
            </span>
            {stats.failedSms > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800">
                {stats.failedSms} Failed
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Queue Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-3 bg-slate-950/70 border-b border-slate-800 flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
          <span>Receipt #</span>
          <span>Recipient</span>
          <span>Created</span>
          <span>Attempts</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>

        <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
          {activeTab === 'email' ? (
            emailItems.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No email items in queue.</div>
            ) : (
              emailItems.map(item => (
                <div key={item.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-sky-400">{item.receipt_number}</span>
                  <span className="text-slate-300 font-mono">{item.recipient_email}</span>
                  <span className="text-slate-400 text-[11px]">{new Date(item.created_at).toLocaleTimeString()}</span>
                  <span className="font-mono text-slate-300">
                    {item.attempts}/{item.max_attempts}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                      item.status === 'sent'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : item.status === 'failed'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {item.status === 'sent' && <Send className="w-3 h-3" />}
                    {item.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                    {item.status === 'queued' && <Clock className="w-3 h-3" />}
                    <span className="capitalize">{item.status}</span>
                  </span>
                  <div className="text-right">
                    {item.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => handleRetry('email', item.id)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded text-[11px] font-bold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )
          ) : smsItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No SMS items in queue.</div>
          ) : (
            smsItems.map(item => (
              <div key={item.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-sky-400">{item.receipt_number}</span>
                <span className="text-slate-300 font-mono">{item.phone_number}</span>
                <span className="text-slate-400 text-[11px]">{new Date(item.created_at).toLocaleTimeString()}</span>
                <span className="font-mono text-slate-300">
                  {item.attempts}/{item.max_attempts}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    item.status === 'sent'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : item.status === 'failed'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  {item.status === 'sent' && <Send className="w-3 h-3" />}
                  {item.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                  {item.status === 'queued' && <Clock className="w-3 h-3" />}
                  <span className="capitalize">{item.status}</span>
                </span>
                <div className="text-right">
                  {item.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => handleRetry('sms', item.id)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded text-[11px] font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
