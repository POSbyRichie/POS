import React, { useState, useEffect } from 'react';
import {
  Printer,
  RotateCcw,
  Mail,
  MessageSquare,
  Search,
  X,
  CheckCircle,
  FileText,
} from 'lucide-react';
import { Receipt } from '../../types';
import { receiptService } from '../../services/receiptService';
import { printService } from '../../services/printService';
import { ReceiptPreview } from './ReceiptPreview';
import { usePos } from '../../store/posStore';

interface ReprintModalProps {
  initialReceipt?: Receipt | null;
  onClose: () => void;
}

export const ReprintModal: React.FC<ReprintModalProps> = ({ initialReceipt, onClose }) => {
  const { currentUser } = usePos();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [receiptsList, setReceiptsList] = useState<Receipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(initialReceipt || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReprinting, setIsReprinting] = useState<boolean>(false);

  // Email / SMS re-queueing
  const [emailInput, setEmailInput] = useState<string>('');
  const [smsInput, setSmsInput] = useState<string>('');
  const [emailSuccess, setEmailSuccess] = useState<boolean>(false);
  const [smsSuccess, setSmsSuccess] = useState<boolean>(false);

  useEffect(() => {
    async function loadReceipts() {
      setIsLoading(true);
      try {
        const list = await receiptService.listReceipts({ search: searchQuery, limit: 30 });
        setReceiptsList(list);
        if (!selectedReceipt && list.length > 0 && !initialReceipt) {
          setSelectedReceipt(list[0]);
        }
      } catch (err) {
        console.error('Failed to load receipts:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadReceipts();
  }, [searchQuery, initialReceipt, selectedReceipt]);

  const handleSelectReceipt = (r: Receipt) => {
    setSelectedReceipt(r);
    setEmailSuccess(false);
    setSmsSuccess(false);
    setEmailInput(r.email_recipient || '');
    setSmsInput(r.sms_recipient || '');
  };

  const handleReprint = async () => {
    if (!selectedReceipt) return;
    setIsReprinting(true);
    try {
      const cashierName = currentUser?.full_name || 'Cashier';
      const cashierId = currentUser?.id || 'system';
      const { receipt: updated } = await receiptService.reprintReceipt(
        selectedReceipt.id,
        cashierId,
        cashierName
      );
      setSelectedReceipt(updated);
      // Update in local list
      setReceiptsList(prev => prev.map(r => (r.id === updated.id ? updated : r)));
      // Send to print
      printService.printReceipt('printable-receipt');
    } catch (err) {
      console.error('Reprint execution error:', err);
    } finally {
      setIsReprinting(false);
    }
  };

  const handleQueueEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceipt || !emailInput || !emailInput.includes('@')) return;

    try {
      await receiptService.queueEmailForReceipt(selectedReceipt.id, emailInput.trim());
      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to queue email:', err);
    }
  };

  const handleQueueSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceipt || !smsInput || smsInput.trim().length < 7) return;

    try {
      await receiptService.queueSmsForReceipt(selectedReceipt.id, smsInput.trim());
      setSmsSuccess(true);
      setTimeout(() => setSmsSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to queue SMS:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
            <RotateCcw className="w-5 h-5 text-sky-400" />
            <span>RECEIPT REPRINT &amp; DISPATCH CENTER</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: 3-column or 2-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Left Column: Receipt List & Search (5 cols) */}
          <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col p-4 space-y-3 overflow-hidden">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search receipt # (e.g. CR-01-20260919-000001)"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 font-mono"
              />
            </div>

            {/* List of Receipts */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/40">
              {isLoading ? (
                <div className="p-6 text-center text-slate-500 text-xs">Loading receipts...</div>
              ) : receiptsList.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">No receipts found</div>
              ) : (
                receiptsList.map(r => {
                  const isSelected = selectedReceipt?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleSelectReceipt(r)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs transition border flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-sky-950/50 border-sky-600 text-white'
                          : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sky-400">{r.receipt_number}</span>
                        {r.reprint_count > 0 && (
                          <span className="px-1.5 py-0.5 bg-amber-950 text-amber-300 text-[9px] rounded-full border border-amber-800">
                            Reprint #{r.reprint_count}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{new Date(r.created_at).toLocaleString()}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            r.sync_status === 'synced'
                              ? 'bg-emerald-950 text-emerald-400'
                              : 'bg-amber-950 text-amber-400'
                          }`}
                        >
                          {r.sync_status}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Center/Right Column: Thermal Preview & Action Tools (7 cols) */}
          <div className="md:col-span-7 flex flex-col md:flex-row overflow-hidden">
            {selectedReceipt ? (
              <>
                {/* Actions sidebar */}
                <div className="w-full md:w-5/12 p-4 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between space-y-4 overflow-y-auto">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-sky-400" />
                        <span>Receipt Actions</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono break-all">
                        {selectedReceipt.receipt_number}
                      </p>
                    </div>

                    {/* Reprint Primary Button */}
                    <button
                      type="button"
                      onClick={handleReprint}
                      disabled={isReprinting}
                      className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-extrabold rounded-xl text-xs transition shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      <span>{isReprinting ? 'Processing...' : 'REPRINT RECEIPT'}</span>
                    </button>

                    {/* Email Queue */}
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-sky-400" />
                        <span>Email Copy</span>
                      </div>
                      <form onSubmit={handleQueueEmail} className="flex gap-2">
                        <input
                          type="email"
                          value={emailInput}
                          onChange={e => setEmailInput(e.target.value)}
                          placeholder="client@mail.com"
                          className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                        >
                          Send
                        </button>
                      </form>
                      {emailSuccess && (
                        <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Queued for delivery!
                        </p>
                      )}
                    </div>

                    {/* SMS Queue */}
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                        <span>SMS Copy</span>
                      </div>
                      <form onSubmit={handleQueueSms} className="flex gap-2">
                        <input
                          type="tel"
                          value={smsInput}
                          onChange={e => setSmsInput(e.target.value)}
                          placeholder="+256..."
                          className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                        >
                          Send
                        </button>
                      </form>
                      {smsSuccess && (
                        <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Queued for SMS!
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Thermal Preview Canvas */}
                <div className="w-full md:w-7/12 p-4 bg-slate-950 flex flex-col items-center justify-center overflow-y-auto">
                  <ReceiptPreview receipt={selectedReceipt} />
                </div>
              </>
            ) : (
              <div className="flex-1 p-12 flex flex-col items-center justify-center text-slate-500 text-xs">
                Select a receipt to view thermal preview and reprint
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
