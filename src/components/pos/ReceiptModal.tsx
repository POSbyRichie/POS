import React, { useState } from 'react';
import {
  Printer,
  Mail,
  MessageSquare,
  CheckCircle,
  X,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { printService } from '../../services/printService';
import { receiptService } from '../../services/receiptService';
import { notificationQueueService } from '../../services/notificationQueueService';
import { ReceiptPreview } from './ReceiptPreview';
import { Receipt } from '../../types';

interface ReceiptModalProps {
  onClose: () => void;
  onProceedToCompleted: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ onClose, onProceedToCompleted }) => {
  const { lastCompletedSaleResult, currentUser } = usePos();
  const [emailInput, setEmailInput] = useState<string>('');
  const [smsInput, setSmsInput] = useState<string>('');
  const [emailQueued, setEmailQueued] = useState<boolean>(false);
  const [smsQueued, setSmsQueued] = useState<boolean>(false);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(
    lastCompletedSaleResult?.receipt || null
  );
  const [isReprinting, setIsReprinting] = useState<boolean>(false);

  if (!lastCompletedSaleResult || !activeReceipt) return null;

  const { sale } = lastCompletedSaleResult;

  const handlePrint = () => {
    printService.printReceipt('printable-receipt');
  };

  const handleReprint = async () => {
    setIsReprinting(true);
    try {
      const cashierName = currentUser?.full_name || 'Cashier';
      const cashierId = currentUser?.id || 'system';
      const { receipt: updated } = await receiptService.reprintReceipt(
        activeReceipt.id,
        cashierId,
        cashierName
      );
      setActiveReceipt(updated);
      printService.printReceipt('printable-receipt');
    } catch (err) {
      console.error('Reprint error:', err);
    } finally {
      setIsReprinting(false);
    }
  };

  const handleQueueEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) return;

    try {
      const parsed = receiptService.parseReceiptContent(activeReceipt);
      await notificationQueueService.queueEmail({
        receiptId: activeReceipt.id,
        saleId: sale.id,
        receiptNumber: activeReceipt.receipt_number,
        recipientEmail: emailInput.trim(),
        customerName: parsed.customer?.name,
      });
      setEmailQueued(true);
    } catch (err) {
      console.error('Failed to queue email:', err);
    }
  };

  const handleQueueSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsInput || smsInput.trim().length < 7) return;

    try {
      const parsed = receiptService.parseReceiptContent(activeReceipt);
      await notificationQueueService.queueSms({
        receiptId: activeReceipt.id,
        saleId: sale.id,
        receiptNumber: activeReceipt.receipt_number,
        phoneNumber: smsInput.trim(),
        customerName: parsed.customer?.name,
      });
      setSmsQueued(true);
    } catch (err) {
      console.error('Failed to queue SMS:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col md:flex-row my-auto max-h-[92vh]">
        {/* Left Column: Actions (Print, Reprint, Email, SMS, Next) */}
        <div className="w-full md:w-5/12 p-5 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between overflow-y-auto space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <Printer className="w-5 h-5 text-sky-400" />
                <span>12. RECEIPT OPTIONS</span>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Number: <span className="font-mono font-bold text-sky-300">{activeReceipt.receipt_number}</span>
            </p>

            {/* Primary Action: Print Receipt */}
            <div className="grid grid-cols-1 gap-2 mb-4">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                PRINT THERMAL RECEIPT
              </button>

              <button
                type="button"
                onClick={handleReprint}
                disabled={isReprinting}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl text-xs transition border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>REPRINT (DUPLICATE)</span>
                {activeReceipt.reprint_count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-950 text-amber-300 text-[10px] rounded-full border border-amber-800">
                    #{activeReceipt.reprint_count}
                  </span>
                )}
              </button>
            </div>

            {/* Email Queue */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Mail className="w-3.5 h-3.5 text-sky-400" />
                <span>Email Digital Receipt</span>
              </div>
              {!emailQueued ? (
                <form onSubmit={handleQueueEmail} className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="customer@email.com"
                    className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                  >
                    Queue
                  </button>
                </form>
              ) : (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle className="w-3.5 h-3.5" /> Enqueued for offline sync!
                </p>
              )}
            </div>

            {/* SMS Queue */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                <span>SMS Receipt (Phone)</span>
              </div>
              {!smsQueued ? (
                <form onSubmit={handleQueueSms} className="flex gap-2">
                  <input
                    type="tel"
                    value={smsInput}
                    onChange={e => setSmsInput(e.target.value)}
                    placeholder="+256 700 000000"
                    className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                  >
                    Queue
                  </button>
                </form>
              ) : (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle className="w-3.5 h-3.5" /> Enqueued for SMS delivery!
                </p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-2">
            {/* Step 16 Transition Button */}
            <button
              onClick={onProceedToCompleted}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <span>CONFIRM SALE COMPLETED (STEP 16)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Thermal Paper Preview */}
        <div className="w-full md:w-7/12 bg-slate-950 p-5 flex flex-col items-center justify-center overflow-y-auto max-h-[85vh]">
          <ReceiptPreview receipt={activeReceipt} />
        </div>
      </div>
    </div>
  );
};
