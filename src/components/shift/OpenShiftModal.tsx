import React, { useState } from 'react';
import { PlayCircle, Terminal, Calendar, AlertTriangle } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { db } from '../../db';
import { Shift } from '../../types';
import { generateUUID } from '../../utils/id';
import { parseToMinorUnits, formatMoney } from '../../utils/money';
import { useRouter } from '../../routes/router';

export const OpenShiftModal: React.FC = () => {
  const { navigate } = useRouter();
  const {
    currentUser,
    activeRegister,
    activeDevice,
    setActiveShift,
    setOpeningShiftOpen,
    setActiveWorkflowStep,
    setActiveView,
  } = usePos();


  const [openingFloatStr, setOpeningFloatStr] = useState<string>('50000'); // Default float UGX 50,000
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeRegister) {
      setError('Active cashier and verified register are required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 1. Business Rule: Check for any existing active shift on this register
      const existingActive = await db.shifts
        .where('register_id')
        .equals(activeRegister.id)
        .and(s => s.status === 'open')
        .first();

      if (existingActive) {
        setError(`Register already has an active open shift (#${existingActive.id.slice(0, 8)}). Please close it first.`);
        setIsSubmitting(false);
        return;
      }

      const floatMinorUnits = parseToMinorUnits(openingFloatStr, 0);
      const shiftId = generateUUID();
      const idempotencyKey = `shift-open-${shiftId}`;
      const now = new Date().toISOString();

      const newShift: Shift = {
        id: shiftId,
        idempotency_key: idempotencyKey,
        register_id: activeRegister.id,
        cashier_id: currentUser.id,
        status: 'open',
        opened_at: now,
        opening_float: floatMinorUnits,
        total_sales: 0,
        transaction_count: 0,
        cash_sales_total: 0,
        card_sales_total: 0,
        wallet_sales_total: 0,
        qr_sales_total: 0,
        notes: notes.trim() || undefined,
        sync_status: 'pending',
      };

      await db.shifts.put(newShift);

      // Add to sync queue
      await db.syncQueue.add({
        entity_type: 'shift',
        entity_id: newShift.id,
        operation: 'INSERT',
        payload: JSON.stringify(newShift),
        idempotency_key: idempotencyKey,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });

      // Step 2 Completed -> Proceed directly to sales workstation for cashiers
      setActiveShift(newShift);
      setOpeningShiftOpen(false);
      if (currentUser.role === 'cashier') {
        setActiveWorkflowStep(4);
        setActiveView('pos');
        navigate('/pos');
      } else {
        setActiveWorkflowStep(3);
        setActiveView('dashboard');
        navigate('/dashboard');
      }

    } catch (err: any) {
      setError(err.message || 'Failed to open shift.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 my-auto max-h-[92vh] flex flex-col">
        <div className="bg-gradient-to-r from-sky-900/60 to-slate-900 p-4 sm:p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-base sm:text-lg mb-1">
            <PlayCircle className="w-5 h-5 text-sky-400" />
            <span>2. OPEN SHIFT</span>
          </div>
          <p className="text-xs text-slate-400">Initialize terminal cash float & verify register before trading</p>
        </div>

        <form onSubmit={handleOpenShift} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Verification Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                <span>Register / Terminal</span>
              </div>
              <p className="text-xs font-bold text-slate-200 truncate">{activeRegister?.register_name}</p>
              <p className="text-[10px] text-slate-500 font-mono">{activeDevice?.id || 'TERMINAL-01'}</p>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cashier on Duty</span>
              </div>
              <p className="text-xs font-bold text-slate-200 truncate">{currentUser?.full_name}</p>
              <p className="text-[10px] text-slate-500 font-mono uppercase">{currentUser?.role}</p>
            </div>
          </div>

          {/* Opening Float Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Opening Cash Float (UGX) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                UGX
              </span>
              <input
                type="number"
                min="0"
                step="100"
                value={openingFloatStr}
                onChange={e => setOpeningFloatStr(e.target.value)}
                required
                className="w-full pl-14 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-lg font-bold text-white focus:outline-none focus:border-sky-500"
                placeholder="50000"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Physical cash counted in register drawer: {formatMoney(parseToMinorUnits(openingFloatStr, 0))}
            </p>
          </div>

          {/* Quick float presets */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Presets:</span>
            {['0', '20000', '50000', '100000', '200000'].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => setOpeningFloatStr(val)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono text-slate-300 transition"
              >
                {parseInt(val) === 0 ? 'Exact 0' : formatMoney(parseInt(val))}
              </button>
            ))}
          </div>

          {/* Shift Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Shift Notes / Handover Comments (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Morning opening shift, received clean float"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Opening Shift...' : 'Open Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
