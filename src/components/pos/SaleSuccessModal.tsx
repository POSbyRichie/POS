import React from 'react';
import { CheckCircle2, ArrowRight, Printer, CheckCircle, CloudOff, X } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { formatMoney } from '../../utils/money';
import { printService } from '../../services/printService';
import { LoyaltyLedgerCard } from '../loyalty/LoyaltyLedgerCard';

interface SaleSuccessModalProps {
  onClose: () => void;
  onNextCustomer: () => void;
}

export const SaleSuccessModal: React.FC<SaleSuccessModalProps> = ({ onClose, onNextCustomer }) => {
  const { lastCompletedSaleResult } = usePos();

  if (!lastCompletedSaleResult) return null;

  const { sale } = lastCompletedSaleResult;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="relative p-4 sm:p-6 bg-gradient-to-b from-emerald-950/90 to-slate-900 border-b border-slate-800 text-center shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-emerald-500 text-slate-950 rounded-2xl flex items-center justify-center mx-auto mb-2 sm:mb-3 shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">Sale Completed</h3>
          <p className="text-xs text-slate-400 mt-1">Payment confirmed &amp; receipt generated</p>
        </div>

        {/* Details card matching example from user prompt */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Receipt:</span>
              <span className="font-mono font-bold text-white">{sale.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Method:</span>
              <span className="font-mono font-bold text-sky-400 uppercase">{sale.payment_method}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Amount:</span>
              <span className="font-mono font-extrabold text-emerald-400 text-sm">
                {formatMoney(sale.total_amount)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="text-slate-400">Status:</span>
              <span className="text-slate-200 font-bold">Saved Locally</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Sync to Cloud:</span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  sale.sync_status === 'synced'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {sale.sync_status === 'synced' ? (
                  <>
                    <CheckCircle className="w-3 h-3" /> Synced
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3 h-3" /> Pending (Queued)
                  </>
                )}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 pt-1">
              <span>Timestamp:</span>
              <span>{new Date(sale.created_at).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Transaction Summary */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Transaction Details
            </span>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block font-medium">Items</span>
                <span className="text-slate-200 font-bold block mt-0.5">
                  {lastCompletedSaleResult.items.length} lines
                </span>
                <span className="text-[9px] text-slate-500">Updated</span>
              </div>

              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block font-medium">Total Paid</span>
                <span className="text-emerald-400 font-bold block mt-0.5">
                  {formatMoney(sale.total_amount)}
                </span>
                <span className="text-[9px] text-slate-500">Settled</span>
              </div>

              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block font-medium">Loyalty</span>
                <span className="text-amber-400 font-bold block mt-0.5">
                  {lastCompletedSaleResult.loyaltyTransaction
                    ? `+${lastCompletedSaleResult.loyaltyTransaction.points_delta} pts`
                    : 'None'}
                </span>
                <span className="text-[9px] text-slate-500">
                  {lastCompletedSaleResult.newCustomerPoints !== undefined
                    ? `Balance: ${lastCompletedSaleResult.newCustomerPoints}`
                    : 'Guest checkout'}
                </span>
              </div>
            </div>

            {/* Loyalty Transaction Card */}
            {lastCompletedSaleResult.loyaltyTransaction && (
              <div className="pt-1">
                <LoyaltyLedgerCard transaction={lastCompletedSaleResult.loyaltyTransaction} />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => printService.printReceipt()}
              className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Reprint
            </button>

            {/* NEXT CUSTOMER Action Button */}
            <button
              onClick={onNextCustomer}
              className="w-2/3 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Next Customer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
