import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  PlayCircle,
  Lock,
  CheckCircle,
  Plus,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { db } from '../../db';
import { shiftService } from '../../services/shiftService';
import { Shift, CashMovement } from '../../types';
import { formatMoney, parseToMinorUnits } from '../../utils/money';
import { CashMovementModal } from './CashMovementModal';

export type ShiftsActiveTab = 'current' | 'open' | 'close';

export const ShiftsView: React.FC = () => {
  const {
    activeShift,
    currentUser,
    activeRegister,
    setActiveShift,
    setActiveWorkflowStep,
    logout,
  } = usePos();

  const [activeTab, setActiveTab] = useState<ShiftsActiveTab>(activeShift ? 'current' : 'open');
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [isCashMovementModalOpen, setIsCashMovementModalOpen] = useState<boolean>(false);
  const [_recentShifts, setRecentShifts] = useState<Shift[]>([]);

  // Open Shift Form State
  const [openingFloatInput, setOpeningFloatInput] = useState<string>('50000');
  const [openShiftNotes, setOpenShiftNotes] = useState<string>('');
  const [openError, setOpenError] = useState<string>('');
  const [isOpening, setIsOpening] = useState<boolean>(false);

  // Close Shift Form State
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [closeShiftNotes, setCloseShiftNotes] = useState<string>('');
  const [closeError, setCloseError] = useState<string>('');
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const loadShiftData = useCallback(async () => {
    const fetchShifts = async () => {
      if (currentUser?.role === 'cashier') {
        return db.shifts.where('cashier_id').equals(currentUser.id).reverse().limit(10).toArray();
      }
      return db.shifts.reverse().limit(10).toArray();
    };

    if (activeShift) {
      try {
        const [movements, shifts] = await Promise.all([
          shiftService.getCashMovements(activeShift.id),
          fetchShifts(),
        ]);
        setCashMovements(movements);
        setRecentShifts(shifts);
      } catch (err) {
        console.error('Failed to load shift cash movements:', err);
      }
    } else {
      const shifts = await fetchShifts();
      setRecentShifts(shifts);
    }
  }, [activeShift, currentUser]);


  useEffect(() => {
    loadShiftData();
  }, [loadShiftData]);

  // Calculations for Current Shift
  const openingFloat = activeShift?.opening_float || 0;
  const cashSales = activeShift?.cash_sales_total || 0;
  const nonCashSales = (activeShift?.total_sales || 0) - cashSales;

  const cashIn = cashMovements
    .filter(m => m.type === 'PAY_IN')
    .reduce((sum, m) => sum + m.amount, 0);

  const cashOut = cashMovements
    .filter(m => m.type === 'PAY_OUT' || m.type === 'SAFE_DROP')
    .reduce((sum, m) => sum + m.amount, 0);

  const expectedCash = openingFloat + cashSales + cashIn - cashOut;
  const actualCash = parseToMinorUnits(actualCashInput || '0', 0);
  const variance = actualCash - expectedCash;

  // Handle Open Shift
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeRegister) {
      setOpenError('Cashier authentication and register assignment are required.');
      return;
    }

    setIsOpening(true);
    setOpenError('');

    try {
      const floatUnits = parseToMinorUnits(openingFloatInput, 0);

      const newShift = await shiftService.openShift({
        registerId: activeRegister.id,
        cashierId: currentUser.id,
        openingFloat: floatUnits,
      });

      setActiveShift(newShift);
      setActiveWorkflowStep(3);
      setActiveTab('current');
      await loadShiftData();
    } catch (err: any) {
      setOpenError(err.message || 'Error opening shift');
    } finally {
      setIsOpening(false);
    }
  };

  // Handle Close Shift
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    if (!actualCashInput) {
      setCloseError('Please enter the counted cash amount.');
      return;
    }

    setIsClosing(true);
    setCloseError('');

    try {
      await shiftService.closeShift({
        shiftId: activeShift.id,
        cashierId: currentUser?.id || activeShift.cashier_id,
        closingCashActual: actualCash,
        notes: closeShiftNotes.trim() || undefined,
      });

      setActiveShift(null);
      setActiveWorkflowStep(1);
      setActiveTab('open');
      await loadShiftData();
      logout();
    } catch (err: any) {
      setCloseError(err.message || 'Error closing shift');
      setIsClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-400" />
            <span>SHIFTS &amp; CASH DRAWER RECONCILIATION</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Open Float, Live Cash Movements, Pay-Ins/Outs &amp; Variance Audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeShift && (
            <button
              onClick={() => setIsCashMovementModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-xl text-xs transition"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>Record Cash Movement</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('current')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'current'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Current Shift {activeShift ? '(Active)' : '(None)'}</span>
        </button>

        <button
          onClick={() => setActiveTab('open')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'open'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>Open Shift</span>
        </button>

        <button
          onClick={() => setActiveTab('close')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'close'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Close Shift</span>
        </button>
      </div>

      {/* TAB 1: CURRENT SHIFT */}
      {activeTab === 'current' && (
        <div className="space-y-6">
          {!activeShift ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <Clock className="w-8 h-8 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-white">No Active Shift</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No shift is currently open on this terminal. Open a shift with a starting float to begin transactions.
              </p>
              <button
                onClick={() => setActiveTab('open')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition"
              >
                Go to Open Shift
              </button>
            </div>
          ) : (
            <>
              {/* Shift Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <span className="text-xs font-semibold text-slate-400 block">Starting Float</span>
                  <span className="text-2xl font-black text-white mt-1 block">{formatMoney(openingFloat)}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Opened at start of shift</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <span className="text-xs font-semibold text-slate-400 block">Cash Sales</span>
                  <span className="text-2xl font-black text-emerald-400 mt-1 block">{formatMoney(cashSales)}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {activeShift.transaction_count} sales ({formatMoney(nonCashSales)} non-cash)
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <span className="text-xs font-semibold text-slate-400 block">Net Cash Movements</span>
                  <span className="text-2xl font-black text-sky-400 mt-1 block">
                    {formatMoney(cashIn - cashOut)}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    +{formatMoney(cashIn)} in / -{formatMoney(cashOut)} out
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
                  <span className="text-xs font-semibold text-slate-400 block">Expected Cash In Drawer</span>
                  <span className="text-2xl font-black text-amber-400 mt-1 block">{formatMoney(expectedCash)}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">System calculated drawer balance</span>
                </div>
              </div>

              {/* Cash Movements Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <span>Shift Cash Movements &amp; Drawer Drops</span>
                  <span className="text-[10px] text-slate-500">{cashMovements.length} recorded movements</span>
                </div>

                <div className="divide-y divide-slate-800/80 max-h-[350px] overflow-y-auto">
                  {cashMovements.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No cash movements recorded during this shift.
                    </div>
                  ) : (
                    cashMovements.map(m => (
                      <div
                        key={m.id}
                        className="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                              m.type === 'PAY_IN'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {m.type}
                          </span>
                          <span className="font-bold text-white">{m.reason || 'Drawer Adjustment'}</span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-sm font-black font-mono ${
                              m.type === 'PAY_IN' ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {m.type === 'PAY_IN' ? `+${formatMoney(m.amount)}` : `-${formatMoney(m.amount)}`}
                          </span>
                          <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                            {new Date(m.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: OPEN SHIFT */}
      {activeTab === 'open' && (
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-emerald-400" />
              <span>Open Cashier Shift</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Verify starting cash in drawer and initialize local register session.
            </p>
          </div>

          {openError && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
              {openError}
            </div>
          )}

          {activeShift ? (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <CheckCircle className="w-4 h-4" />
                <span>Shift is currently ACTIVE (# {activeShift.id.slice(0, 8)})</span>
              </div>
              <p className="text-xs text-slate-400">
                You already have an active shift with opening float of {formatMoney(activeShift.opening_float)}.
              </p>
              <button
                onClick={() => setActiveTab('current')}
                className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition"
              >
                View Current Shift Dashboard
              </button>
            </div>
          ) : (
            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Starting Float Amount (UGX) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={openingFloatInput}
                  onChange={e => setOpeningFloatInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono text-base font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Opening Notes / Shift Remarks</label>
                <input
                  type="text"
                  value={openShiftNotes}
                  onChange={e => setOpenShiftNotes(e.target.value)}
                  placeholder="e.g., Morning Shift Counter 1"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isOpening}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{isOpening ? 'Opening Shift...' : 'Confirm & Open Shift'}</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: CLOSE SHIFT */}
      {activeTab === 'close' && (
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-400" />
              <span>Close Shift &amp; Reconcile Drawer</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Count drawer cash, calculate over/short variance, and finalize shift audit record.
            </p>
          </div>

          {closeError && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
              {closeError}
            </div>
          )}

          {!activeShift ? (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
              No active shift to close.
            </div>
          ) : (
            <form onSubmit={handleCloseShift} className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Expected Cash In Drawer:</span>
                  <span className="font-bold text-white font-mono">{formatMoney(expectedCash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Shift Sales:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {formatMoney(activeShift.total_sales || 0)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Counted Actual Cash In Drawer (UGX) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={actualCashInput}
                  onChange={e => setActualCashInput(e.target.value)}
                  placeholder="Enter counted cash in drawer"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono text-base font-bold"
                />
              </div>

              {actualCashInput && (
                <div
                  className={`p-3 rounded-xl border text-xs flex justify-between items-center ${
                    variance === 0
                      ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                      : variance > 0
                      ? 'bg-sky-950/80 border-sky-800 text-sky-300'
                      : 'bg-rose-950/80 border-rose-800 text-rose-300'
                  }`}
                >
                  <span className="font-semibold">Calculated Drawer Variance:</span>
                  <span className="font-bold font-mono text-sm">
                    {variance === 0 ? 'EXACT (0 variance)' : variance > 0 ? `OVER +${formatMoney(variance)}` : `SHORT -${formatMoney(Math.abs(variance))}`}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Closing Remarks / Explanations</label>
                <input
                  type="text"
                  value={closeShiftNotes}
                  onChange={e => setCloseShiftNotes(e.target.value)}
                  placeholder="e.g. Drawer balanced, shift completed"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={isClosing || !actualCashInput}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>{isClosing ? 'Finalizing Shift Reconciliation...' : 'Reconcile & Close Shift'}</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* Cash Movement Modal */}
      {isCashMovementModalOpen && (
        <CashMovementModal
          onClose={() => {
            setIsCashMovementModalOpen(false);
            loadShiftData();
          }}
        />
      )}
    </div>
  );
};
