import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ShieldAlert, AlertTriangle, CheckCircle, Banknote } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { shiftService } from '../../services/shiftService';
import { CashMovementType } from '../../types';
import { parseToMinorUnits, formatMoney } from '../../utils/money';

interface CashMovementModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({ onClose, onSuccess }) => {
  const { activeShift, activeRegister, currentUser } = usePos();

  const [type, setType] = useState<CashMovementType>('PAY_OUT');
  const [amountStr, setAmountStr] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!activeShift || !activeRegister || !currentUser) return null;

  const currentExpectedCash = (activeShift.opening_float || 0) +
    (activeShift.cash_sales_total || 0) +
    (activeShift.cash_in_total || 0) -
    (activeShift.cash_out_total || 0);

  const amountMinor = parseToMinorUnits(amountStr, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountMinor || amountMinor <= 0) {
      setError('Please enter a valid positive cash amount.');
      return;
    }
    if (!reason.trim()) {
      setError('A descriptive reason is mandatory for drawer cash movements.');
      return;
    }

    if ((type === 'PAY_OUT' || type === 'SAFE_DROP') && amountMinor > currentExpectedCash) {
      setError(
        `Insufficient drawer funds. Current estimated drawer cash is ${formatMoney(currentExpectedCash)}, cannot withdraw ${formatMoney(amountMinor)}.`
      );
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await shiftService.recordCashMovement({
        shiftId: activeShift.id,
        registerId: activeRegister.id,
        cashierId: currentUser.id,
        type,
        amount: amountMinor,
        reason: reason.trim(),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record cash movement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-gradient-to-r from-slate-950 to-slate-900 p-5 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Banknote className="w-5 h-5 text-amber-400" />
            <span>DRAWER CASH MOVEMENT</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Movement Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Movement Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('PAY_IN')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition ${
                  type === 'PAY_IN'
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 mb-1 text-emerald-400" />
                <span>Pay In (Float In)</span>
              </button>

              <button
                type="button"
                onClick={() => setType('PAY_OUT')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition ${
                  type === 'PAY_OUT'
                    ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 mb-1 text-rose-400" />
                <span>Pay Out (Expense)</span>
              </button>

              <button
                type="button"
                onClick={() => setType('SAFE_DROP')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition ${
                  type === 'SAFE_DROP'
                    ? 'bg-purple-950/80 border-purple-500 text-purple-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <ShieldAlert className="w-4 h-4 mb-1 text-purple-400" />
                <span>Safe Drop</span>
              </button>
            </div>
          </div>

          {/* Current Drawer Context */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Estimated Drawer Cash:</span>
            <span className="font-mono font-bold text-white">{formatMoney(currentExpectedCash)}</span>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Cash Amount (UGX)
            </label>
            <input
              type="number"
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
              placeholder="e.g. 20000"
              min="1"
              required
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-lg focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Reason input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Reason / Justification (Mandatory for Audit)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={
                type === 'PAY_IN'
                  ? 'e.g. Added 20k petty cash for coin change'
                  : type === 'PAY_OUT'
                    ? 'e.g. Paid delivery rider UGX 5,000'
                    : 'e.g. Mid-day safe drop for high-denomination notes'
              }
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-1.5 shadow-lg ${
                type === 'PAY_IN'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : type === 'PAY_OUT'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-purple-600 hover:bg-purple-500'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Recording…' : `Confirm ${type.replace('_', ' ')}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
