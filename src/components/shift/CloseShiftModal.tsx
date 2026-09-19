import React, { useState } from 'react';
import { Lock, AlertTriangle, LogOut } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { db } from '../../db';
import { parseToMinorUnits, formatMoney } from '../../utils/money';

interface CloseShiftModalProps {
  onClose: () => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({ onClose }) => {
  const { activeShift, currentUser, setActiveShift, setActiveWorkflowStep, logout } = usePos();
  const [actualCashStr, setActualCashStr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  React.useEffect(() => {
    setActiveWorkflowStep(18);
  }, [setActiveWorkflowStep]);

  if (!activeShift) return null;

  const openingFloat = activeShift.opening_float || 0;
  const cashSales = activeShift.cash_sales_total || 0;
  const expectedCash = openingFloat + cashSales;
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
      const now = new Date().toISOString();

      await db.shifts.update(activeShift.id, {
        status: 'closed',
        closed_at: now,
        closing_cash_actual: actualCash,
        closing_cash_expected: expectedCash,
        variance,
        notes: notes.trim() || undefined,
        sync_status: 'pending',
      });

      // Update sync queue
      const updatedShift = await db.shifts.get(activeShift.id);
      await db.syncQueue.add({
        entity_type: 'shift',
        entity_id: activeShift.id,
        operation: 'UPDATE',
        payload: JSON.stringify(updatedShift),
        idempotency_key: `shift-close-${activeShift.id}`,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });

      // Audit log
      await db.auditLogs.add({
        user_id: currentUser?.id || 'unknown',
        action: 'CLOSE_SHIFT',
        entity_type: 'shift',
        entity_id: activeShift.id,
        details: `Expected: ${expectedCash}, Actual: ${actualCash}, Variance: ${variance}`,
        timestamp: now,
        sync_status: 'pending',
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
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-gradient-to-r from-rose-950/70 to-slate-900 p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 text-rose-400 font-bold text-lg mb-0.5">
              <Lock className="w-5 h-5" />
              <span>18. CLOSE SHIFT &amp; RECONCILIATION</span>
            </div>
            <p className="text-xs text-slate-400">Perform physical drawer count and verify variance</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">
            &times;
          </button>
        </div>

        <form onSubmit={handleCloseShift} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Shift Financial Summary */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Shift Opened:</span>
              <span className="font-mono text-slate-200">{new Date(activeShift.opened_at).toLocaleTimeString()}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Opening Float:</span>
              <span className="font-mono text-slate-200">{formatMoney(openingFloat)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Total Transactions:</span>
              <span className="font-mono text-slate-200">{activeShift.transaction_count || 0} completed</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Gross Sales (All Methods):</span>
              <span className="font-mono text-slate-200">{formatMoney(activeShift.total_sales || 0)}</span>
            </div>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-[11px] text-center">
              <div className="bg-slate-900/80 p-2 rounded-lg">
                <span className="text-slate-400 block">Cash Sales</span>
                <span className="font-bold text-emerald-400">{formatMoney(cashSales)}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg">
                <span className="text-slate-400 block">Card Sales</span>
                <span className="font-bold text-sky-400">{formatMoney(activeShift.card_sales_total || 0)}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg">
                <span className="text-slate-400 block">Wallet/QR</span>
                <span className="font-bold text-purple-400">
                  {formatMoney((activeShift.wallet_sales_total || 0) + (activeShift.qr_sales_total || 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Expected Cash Banner */}
          <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-sky-300 font-medium block">Expected Drawer Cash</span>
              <span className="text-[10px] text-slate-400">Opening Float + Cash Sales</span>
            </div>
            <span className="text-lg font-bold text-sky-200 font-mono">{formatMoney(expectedCash)}</span>
          </div>

          {/* Cash Count Input */}
          <div>
            <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
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
