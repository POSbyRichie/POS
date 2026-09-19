import React, { useState, useEffect } from 'react';
import { Lock, AlertTriangle, LogOut, ArrowDownLeft, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { shiftService } from '../../services/shiftService';
import { CashMovement } from '../../types';
import { parseToMinorUnits, formatMoney } from '../../utils/money';

interface CloseShiftModalProps {
  onClose: () => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({ onClose }) => {
  const { activeShift, currentUser, setActiveShift, setActiveWorkflowStep, logout } = usePos();
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [actualCashStr, setActualCashStr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setActiveWorkflowStep(18);
    if (activeShift) {
      shiftService.getCashMovements(activeShift.id).then(setCashMovements).catch(() => {});
    }
  }, [activeShift, setActiveWorkflowStep]);

  if (!activeShift) return null;

  const openingFloat = activeShift.opening_float || 0;
  const cashSales = activeShift.cash_sales_total || 0;

  const cashIn = cashMovements
    .filter(m => m.type === 'PAY_IN')
    .reduce((sum, m) => sum + m.amount, 0);

  const cashOut = cashMovements
    .filter(m => m.type === 'PAY_OUT' || m.type === 'SAFE_DROP')
    .reduce((sum, m) => sum + m.amount, 0);

  const expectedCash = openingFloat + cashSales + cashIn - cashOut;
  const actualCash = parseToMinorUnits(actualCashStr, 0);
  const variance = actualCash - expectedCash;

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualCashStr) {
      setError('Please count and enter physical cash in drawer.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await shiftService.closeShift({
        shiftId: activeShift.id,
        cashierId: currentUser?.id || 'cashier',
        closingCashActual: actualCash,
        notes: notes.trim() || undefined,
      });

      setActiveShift(null);
      onClose();
      logout(); // End of Step 18: Logout
    } catch (err: any) {
      setError(err.message || 'Failed to close shift.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-rose-950/70 to-slate-900 p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <div className="flex items-center gap-2 text-rose-400 font-bold text-lg mb-0.5">
              <Lock className="w-5 h-5" />
              <span>18. CLOSE SHIFT &amp; RECONCILIATION</span>
            </div>
            <p className="text-xs text-slate-400">Reconcile drawer with sales and cash movements</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">
            &times;
          </button>
        </div>

        <form onSubmit={handleCloseShift} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Mathematical Reconciliation Formula */}
          <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-2.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Drawer Cash Formula
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Opening Float</span>
                <span className="font-mono font-bold text-white">{formatMoney(openingFloat)}</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">(+) Cash Sales</span>
                <span className="font-mono font-bold text-emerald-400">{formatMoney(cashSales)}</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">(+) Pay Ins</span>
                <span className="font-mono font-bold text-sky-400">{formatMoney(cashIn)}</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">(-) Pay Outs/Drops</span>
                <span className="font-mono font-bold text-rose-400">{formatMoney(cashOut)}</span>
              </div>
            </div>

            {/* Expected Cash Banner */}
            <div className="p-3 bg-sky-950/50 border border-sky-800/80 rounded-xl flex items-center justify-between mt-2">
              <div>
                <span className="text-xs text-sky-300 font-bold block">Expected Drawer Cash</span>
                <span className="text-[10px] text-slate-400">Float + Cash Sales + Pay Ins - Cash Outs</span>
              </div>
              <span className="text-xl font-bold text-sky-200 font-mono">{formatMoney(expectedCash)}</span>
            </div>
          </div>

          {/* Cash Movements Itemized List */}
          {cashMovements.length > 0 && (
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Shift Cash Movements ({cashMovements.length})</span>
                <span className="text-[10px] text-slate-500">Audit Trail</span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {cashMovements.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-xs p-2 bg-slate-900/70 rounded-lg border border-slate-800/60">
                    <div className="flex items-center gap-1.5">
                      {m.type === 'PAY_IN' ? (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                      ) : m.type === 'SAFE_DROP' ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span className="font-semibold text-slate-300">{m.reason}</span>
                    </div>
                    <span className={`font-mono font-bold ${m.type === 'PAY_IN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.type === 'PAY_IN' ? '+' : '-'}{formatMoney(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actual Cash Input */}
          <div>
            <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5">
              Physical Cash Counted in Drawer (UGX) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                UGX
              </span>
              <input
                type="number"
                min="0"
                step="100"
                value={actualCashStr}
                onChange={e => setActualCashStr(e.target.value)}
                required
                className="w-full pl-14 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-lg font-bold text-white focus:outline-none focus:border-rose-500 font-mono"
                placeholder="0"
                autoFocus
              />
            </div>
          </div>

          {/* Variance Check Display */}
          {actualCashStr !== '' && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                variance === 0
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : variance > 0
                  ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              <div>
                <span className="text-xs font-bold block">
                  {variance === 0 ? 'Exact Match (Balanced)' : variance > 0 ? 'Cash Over' : 'Cash Short'}
                </span>
                <span className="text-[10px] opacity-80">Difference between counted and expected cash</span>
              </div>
              <span className="text-base font-bold font-mono">
                {variance > 0 ? `+${formatMoney(variance)}` : formatMoney(variance)}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Closing Reason / Variance Explanation
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. End of shift drawer count verified"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || actualCashStr === ''}
              className="w-2/3 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              {isSubmitting ? 'Closing Shift...' : 'CONFIRM & CLOSE SHIFT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
