import React, { useEffect, useState } from 'react';
import {
  ShoppingCart,
  Clock,
  Terminal,
  TrendingUp,
  PlusCircle,
  Banknote,
  Users,
  LogOut,
  Search,
  CheckCircle2,
  Receipt,
  UserCheck,
  UserCog,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { useRouter } from '../../routes/router';
import { db } from '../../db';
import { Sale } from '../../types';
import { formatMoney } from '../../utils/money';
import { OfflineIndicator } from './OfflineIndicator';
import { CashMovementModal } from '../shift/CashMovementModal';

interface CashierDashboardProps {
  onOpenSyncModal: () => void;
}

export const CashierDashboard: React.FC<CashierDashboardProps> = ({ onOpenSyncModal }) => {
  const { navigate } = useRouter();
  const {
    currentUser,
    activeShift,
    activeRegister,
    cartItems,
    startNewSale,
    setActiveView,
    setClosingShiftOpen,
    setUserProfileOpen,
    logout,
  } = usePos();

  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());
  const [shiftSales, setShiftSales] = useState<Sale[]>([]);
  const [shiftSalesCount, setShiftSalesCount] = useState<number>(0);
  const [shiftSalesTotal, setShiftSalesTotal] = useState<number>(0);
  const [cashSalesTotal, setCashSalesTotal] = useState<number>(0);
  const [isCashMovementOpen, setIsCashMovementOpen] = useState<boolean>(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    loadShiftMetrics();
    return () => clearInterval(timer);
  }, [activeShift]);

  const loadShiftMetrics = async () => {
    if (!activeShift) return;

    // Load completed sales belonging to current active shift
    const sales = await db.sales
      .where('shift_id')
      .equals(activeShift.id)
      .and(s => s.payment_status === 'paid')
      .reverse()
      .sortBy('created_at');

    setShiftSales(sales);
    setShiftSalesCount(sales.length);

    const total = sales.reduce((sum, s) => sum + s.total_amount, 0);
    setShiftSalesTotal(total);

    // Calculate cash collected
    let cashSum = 0;
    for (const s of sales) {
      const payments = await db.payments.where('sale_id').equals(s.id).toArray();
      for (const p of payments) {
        if (p.method === 'cash') {
          cashSum += p.amount_paid;
        }
      }
    }
    setCashSalesTotal(cashSum);
  };


  const handleStartSale = () => {
    startNewSale();
    setActiveView('pos');
    navigate('/pos');
  };

  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickSearchTerm.trim()) {
      navigate('/pos');
    }
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Top Cashier Workstation Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0">
            {currentUser?.full_name?.charAt(0) || 'C'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                {currentUser?.full_name || 'Cashier'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                Cashier Workstation
              </span>
              <OfflineIndicator onOpenSyncModal={onOpenSyncModal} />
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span>Register: <strong className="text-slate-700">{activeRegister?.register_name || 'Terminal 1'}</strong></span>
              <span>&bull;</span>
              <span>Shift: <code className="text-indigo-600 font-mono font-bold">#{activeShift ? activeShift.id.slice(0, 8) : 'None'}</code></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Clock */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span>{currentTime}</span>
          </div>

          {/* Edit Profile CTA */}
          <button
            type="button"
            onClick={() => setUserProfileOpen(true)}
            title="Edit Profile & Password"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold rounded-xl text-xs transition active:scale-95 cursor-pointer"
          >
            <UserCog className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Edit Profile</span>
          </button>

          {/* Start New Sale CTA */}
          <button
            type="button"
            onClick={handleStartSale}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Start New Sale</span>
          </button>
        </div>
      </div>

      {/* Cashier Shift Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Shift Sales Total */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shift Sales Total</span>
              <p className="text-2xl font-bold text-slate-900 font-mono mt-1">{formatMoney(shiftSalesTotal)}</p>
            </div>
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2 block">
            {shiftSalesCount} completed transaction{shiftSalesCount === 1 ? '' : 's'}
          </span>
        </div>

        {/* Cash in Drawer */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. Cash in Drawer</span>
              <p className="text-2xl font-bold text-emerald-600 font-mono mt-1">
                {formatMoney((activeShift?.opening_float || 0) + cashSalesTotal)}
              </p>
            </div>
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-600">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2 block">
            Float: {formatMoney(activeShift?.opening_float || 0)} + Cash: {formatMoney(cashSalesTotal)}
          </span>
        </div>

        {/* Current Cart Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Cart</span>
              <p className="text-2xl font-bold text-indigo-600 font-mono mt-1">
                {cartItems.reduce((acc, i) => acc + i.quantity, 0)} <span className="text-sm font-normal text-slate-500">items</span>
              </p>
            </div>
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-600">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveView('pos');
              navigate('/pos');
            }}
            className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold mt-2 block hover:underline"
          >
            {cartItems.length > 0 ? 'Resume active sale →' : 'Go to scanner →'}
          </button>
        </div>

        {/* Register & Terminal Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Register Terminal</span>
              <p className="text-base font-bold text-slate-900 truncate mt-1">{activeRegister?.register_name || 'Register 1'}</p>
            </div>
            <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-600">
              <Terminal className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Status:</span>
            <span className="text-emerald-600 font-bold uppercase">Ready for Sales</span>
          </div>
        </div>
      </div>

      {/* Primary Workstation Actions & Quick Scanner Search */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Product Scanner / Search Bar */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-600" />
              <span>Quick Product Search &amp; Scan</span>
            </h2>
            <span className="text-[11px] text-slate-500">Barcode scanner ready</span>
          </div>

          <form onSubmit={handleQuickSearchSubmit} className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={quickSearchTerm}
              onChange={e => setQuickSearchTerm(e.target.value)}
              placeholder="Scan barcode or type product name/SKU, then press Enter to jump to register..."
              className="w-full pl-11 pr-28 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition"
            >
              Scan / Add
            </button>
          </form>

          {/* Quick Shortcuts for Cashier */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <button
              type="button"
              onClick={handleStartSale}
              className="p-4 bg-slate-50 border border-slate-200 hover:border-emerald-500 hover:bg-slate-100 rounded-xl text-left transition group cursor-pointer"
            >
              <ShoppingCart className="w-5 h-5 text-emerald-600 mb-2 group-hover:scale-110 transition" />
              <span className="font-bold text-slate-800 text-xs block group-hover:text-emerald-700 transition">Sales Register</span>
              <span className="text-[10px] text-slate-500">Open register screen</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="p-4 bg-slate-50 border border-slate-200 hover:border-purple-500 hover:bg-slate-100 rounded-xl text-left transition group cursor-pointer"
            >
              <Users className="w-5 h-5 text-purple-600 mb-2 group-hover:scale-110 transition" />
              <span className="font-bold text-slate-800 text-xs block group-hover:text-purple-700 transition">Customer Loyalty</span>
              <span className="text-[10px] text-slate-500">Lookup &amp; earn points</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCashMovementOpen(true)}
              className="p-4 bg-slate-50 border border-slate-200 hover:border-amber-500 hover:bg-slate-100 rounded-xl text-left transition group cursor-pointer"
            >
              <Banknote className="w-5 h-5 text-amber-600 mb-2 group-hover:scale-110 transition" />
              <span className="font-bold text-slate-800 text-xs block group-hover:text-amber-700 transition">Cash Movement</span>
              <span className="text-[10px] text-slate-500">Cash drop &amp; float</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/shifts')}
              className="p-4 bg-slate-50 border border-slate-200 hover:border-indigo-500 hover:bg-slate-100 rounded-xl text-left transition group cursor-pointer"
            >
              <Receipt className="w-5 h-5 text-indigo-600 mb-2 group-hover:scale-110 transition" />
              <span className="font-bold text-slate-800 text-xs block group-hover:text-indigo-700 transition">My Shifts</span>
              <span className="text-[10px] text-slate-500">View own shift log</span>
            </button>
          </div>
        </div>

        {/* End of Shift / Drawer Actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Shift Operations</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              When finishing your duty period, verify cash drawer physical count, perform cash drop if required, and close shift.
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mt-4 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Cashier ID:</span>
                <span className="font-mono text-slate-800 font-semibold">{currentUser?.username}</span>
              </div>
              <div className="flex justify-between">
                <span>Opened At:</span>
                <span className="font-mono text-slate-800 font-semibold">
                  {activeShift ? new Date(activeShift.opened_at).toLocaleTimeString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Transactions:</span>
                <span className="font-bold text-emerald-600">{shiftSalesCount}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => setClosingShiftOpen(true)}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl text-xs transition shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Banknote className="w-4 h-4" />
              <span>Close Active Shift (Reconciliation)</span>
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 font-semibold rounded-xl text-xs transition border border-slate-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Switch Cashier / Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Transactions in this Shift */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Recent Completed Sales (This Shift)</span>
          </h2>
          <span className="text-xs text-slate-500 font-mono">{shiftSales.length} records</span>
        </div>

        {shiftSales.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs text-slate-500">No transactions recorded yet in this shift.</p>
            <button
              type="button"
              onClick={handleStartSale}
              className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-sm"
            >
              Ring Up First Sale
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {shiftSales.slice(0, 6).map(sale => (
              <div
                key={sale.id}
                className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-50 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 font-mono">{sale.receipt_number}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold uppercase">
                      {sale.payment_status}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                    {new Date(sale.created_at).toLocaleTimeString()} &bull; ID: {sale.id.slice(0, 8)}
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="text-xs text-slate-500 font-mono">
                    Payment: <strong className="text-slate-800 uppercase">{sale.payment_method}</strong>
                  </span>
                  <span className="text-sm font-black text-slate-900 font-mono">{formatMoney(sale.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isCashMovementOpen && (
        <CashMovementModal
          onClose={() => setIsCashMovementOpen(false)}
          onSuccess={() => loadShiftMetrics()}
        />
      )}
    </div>
  );
};
