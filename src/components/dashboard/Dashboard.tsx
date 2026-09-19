import React, { useEffect, useState } from 'react';
import {
  ShoppingCart,
  AlertTriangle,
  Clock,
  User,
  Terminal,
  TrendingUp,
  Package,
  PlusCircle,
  Banknote,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { db } from '../../db';
import { Product } from '../../types';
import { formatMoney } from '../../utils/money';
import { OfflineIndicator } from './OfflineIndicator';
import { CashMovementModal } from '../shift/CashMovementModal';

interface DashboardProps {
  onOpenSyncModal: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenSyncModal }) => {
  const {
    currentUser,
    activeShift,
    activeRegister,
    cartItems,
    startNewSale,
    setActiveView,
    setClosingShiftOpen,
  } = usePos();

  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [todaySalesCount, setTodaySalesCount] = useState<number>(0);
  const [todaySalesAmount, setTodaySalesAmount] = useState<number>(0);
  const [isCashMovementOpen, setIsCashMovementOpen] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    loadDashboardMetrics();
    return () => clearInterval(timer);
  }, [activeShift]);

  const loadDashboardMetrics = async () => {
    // 1. Fetch low stock items
    const allProducts = await db.products.where('is_active').equals(1).toArray();
    const lowStock = allProducts.filter(p => p.stock_quantity <= p.min_stock_level);
    setLowStockProducts(lowStock);

    // 2. Fetch today's sales
    const allSales = await db.sales.toArray();
    const today = new Date().toISOString().slice(0, 10);
    const todaysCompleted = allSales.filter(s => s.created_at.startsWith(today) && s.payment_status === 'paid');

    setTodaySalesCount(todaysCompleted.length);
    const totalAmount = todaysCompleted.reduce((sum, s) => sum + s.total_amount, 0);
    setTodaySalesAmount(totalAmount);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">3. POS DASHBOARD</h2>
            <OfflineIndicator onOpenSyncModal={onOpenSyncModal} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time terminal telemetry &bull; Register <span className="text-slate-200 font-semibold">{activeRegister?.register_name}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Digital Clock */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>{currentTime}</span>
          </div>

          {/* Primary CTA: NEW SALE (Step 4) */}
          <button
            onClick={() => startNewSale()}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            START NEW SALE (STEP 4)
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Sales</span>
              <p className="text-2xl font-bold text-white font-mono mt-1">{formatMoney(todaySalesAmount)}</p>
            </div>
            <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block">
            {todaySalesCount} completed transactions today
          </span>
        </div>

        {/* Current Active Shift */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Shift</span>
              <p className="text-base font-bold text-sky-300 font-mono mt-1">
                {activeShift ? `#${activeShift.id.slice(0, 8)}` : 'No Open Shift'}
              </p>
            </div>
            <div className="p-2.5 bg-sky-950/60 border border-sky-800/60 rounded-xl text-sky-400">
              <Terminal className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Float: {formatMoney(activeShift?.opening_float || 0)}</span>
            <span className="text-emerald-400 font-medium">STATUS: {activeShift?.status?.toUpperCase()}</span>
          </div>
        </div>

        {/* Current Cashier */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cashier on Duty</span>
              <p className="text-base font-bold text-white truncate mt-1">{currentUser?.full_name}</p>
            </div>
            <div className="p-2.5 bg-purple-950/60 border border-purple-800/60 rounded-xl text-purple-400">
              <User className="w-5 h-5" />
            </div>
          </div>
          <span className="text-[11px] text-purple-400 font-mono mt-2 block uppercase">
            Role: {currentUser?.role}
          </span>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low Stock Alerts</span>
              <p className="text-2xl font-bold text-amber-400 font-mono mt-1">{lowStockProducts.length}</p>
            </div>
            <div className="p-2.5 bg-amber-950/60 border border-amber-800/60 rounded-xl text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block">Products needing restock</span>
        </div>
      </div>

      {/* Main Grid: Low Stock Alert List & Active Cart Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Warning Panel */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Low Stock &amp; Out of Stock Monitoring
              </h3>
            </div>
            <span className="text-xs text-slate-400">{lowStockProducts.length} items flagged</span>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800/60">
              <p className="text-xs text-slate-400">All products have healthy inventory levels.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
              {lowStockProducts.slice(0, 5).map(prod => (
                <div key={prod.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-200 block">{prod.name}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      SKU: {prod.sku} &bull; Barcode: {prod.barcode}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        prod.stock_quantity <= 0
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {prod.stock_quantity <= 0 ? 'OUT OF STOCK (0)' : `${prod.stock_quantity} left in stock`}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Min threshold: {prod.min_stock_level}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Cart Status & Quick Action Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Current Cart Session</h3>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2 mb-4">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Items in Cart:</span>
                <span className="font-bold text-slate-200">
                  {cartItems.reduce((acc, i) => acc + i.quantity, 0)} units
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Unique SKUs:</span>
                <span className="font-bold text-slate-200">{cartItems.length} lines</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => {
                if (cartItems.length === 0) startNewSale();
                setActiveView('pos');
              }}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              {cartItems.length > 0 ? 'RESUME ACTIVE CART' : 'GO TO PRODUCT SCANNER'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsCashMovementOpen(true)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-bold rounded-xl text-xs transition border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Cash Movement</span>
              </button>

              <button
                type="button"
                onClick={() => setClosingShiftOpen(true)}
                className="py-2.5 bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-300 font-semibold rounded-xl text-xs transition border border-slate-700"
              >
                Close Shift (Step 18)
              </button>
            </div>
          </div>
        </div>
      </div>

      {isCashMovementOpen && (
        <CashMovementModal
          onClose={() => setIsCashMovementOpen(false)}
          onSuccess={() => loadDashboardMetrics()}
        />
      )}
    </div>
  );
};
