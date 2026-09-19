import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Cloud,
  LogOut,
  User,
  Terminal,
  PlayCircle,
  Lock,
  Zap,
} from 'lucide-react';
import { usePos } from './store/posStore';
import { seedDatabase } from './db/seed';

// Components
import { LoginModal } from './components/auth/LoginModal';
import { OpenShiftModal } from './components/shift/OpenShiftModal';
import { CloseShiftModal } from './components/shift/CloseShiftModal';
import { Dashboard } from './components/dashboard/Dashboard';
import { ProductCatalog } from './components/pos/ProductCatalog';
import { CartReview } from './components/pos/CartReview';
import { CustomerSelector } from './components/pos/CustomerSelector';
import { PaymentModal } from './components/pos/PaymentModal';
import { ReceiptModal } from './components/pos/ReceiptModal';
import { SaleSuccessModal } from './components/pos/SaleSuccessModal';
import { ProductNotFoundModal } from './components/pos/ProductNotFoundModal';
import { StockAlertModal } from './components/pos/StockAlertModal';
import { SyncStatusModal } from './components/sync/SyncStatusModal';
import { InventoryManager } from './components/inventory/InventoryManager';
import { ReportsView } from './components/reports/ReportsView';
import { OfflineIndicator } from './components/dashboard/OfflineIndicator';

export function App() {
  const {
    currentUser,
    activeShift,
    activeRegister,
    activeWorkflowStep,
    activeView,
    isOpeningShiftOpen,
    isClosingShiftOpen,
    isPaymentModalOpen,
    isReceiptModalOpen,
    isCustomerModalOpen,
    setActiveView,
    setOpeningShiftOpen,
    setClosingShiftOpen,
    setPaymentModalOpen,
    setReceiptModalOpen,
    setCustomerModalOpen,
    startNewSale,
    logout,
  } = usePos();

  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      await seedDatabase();
      setIsInitialized(true);
    }
    init();
  }, []);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold">Initializing Offline-First POS Engine...</p>
        <p className="text-xs text-slate-500 mt-1">Checking IndexedDB and cached catalogs</p>
      </div>
    );
  }

  // Authoritative Step 1: If no authenticated user -> force Cashier Login
  if (!currentUser) {
    return <LoginModal />;
  }

  // Authoritative Step 2: If user logged in but no open shift and not modal dismissed
  if (!activeShift && isOpeningShiftOpen) {
    return <OpenShiftModal />;
  }

  const workflowSteps = [
    { num: 1, label: 'Login' },
    { num: 2, label: 'Open Shift' },
    { num: 3, label: 'Dashboard' },
    { num: 4, label: 'New Sale' },
    { num: 5, label: 'Scan / Search' },
    { num: 6, label: 'Check Stock' },
    { num: 7, label: 'Add to Cart' },
    { num: 8, label: 'Review Cart' },
    { num: 9, label: 'Customer' },
    { num: 10, label: 'Payment' },
    { num: 11, label: 'Payment Check' },
    { num: 12, label: 'Receipt' },
    { num: 13, label: 'Update Stock' },
    { num: 14, label: 'Sales Report' },
    { num: 15, label: 'Loyalty Points' },
    { num: 16, label: 'Sale Completed' },
    { num: 17, label: 'Next Customer' },
    { num: 18, label: 'Close Shift' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100 selection:bg-sky-500 selection:text-white">
      {/* Top Application Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shadow-md shrink-0">
        {/* Brand & Terminal Identifier */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-emerald-500 flex items-center justify-center font-black text-slate-950 shadow-md shadow-sky-500/20">
            <Zap className="w-5 h-5 fill-slate-950" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
              ANTIGRAVITY POS
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                OFFLINE-FIRST
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              {activeRegister?.register_name || 'Terminal 01'}
            </p>
          </div>
        </div>

        {/* View Navigation */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveView('pos')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeView === 'pos'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            POS Terminal
          </button>

          <button
            onClick={() => setActiveView('dashboard')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeView === 'dashboard'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard (Step 3)
          </button>

          <button
            onClick={() => setActiveView('inventory')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeView === 'inventory'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Inventory (Step 13)
          </button>

          <button
            onClick={() => setActiveView('reports')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeView === 'reports'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Reports (Step 14)
          </button>
        </nav>

        {/* Right Section: Telemetry & Cashier Controls */}
        <div className="flex items-center gap-3">
          <OfflineIndicator onOpenSyncModal={() => setIsSyncModalOpen(true)} />

          {/* Shift status indicator / Open / Close button */}
          {activeShift ? (
            <button
              onClick={() => setClosingShiftOpen(true)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-semibold transition border border-slate-700 flex items-center gap-1.5"
              title="Close Shift (Step 18)"
            >
              <Lock className="w-3.5 h-3.5 text-rose-400" />
              <span>Shift #{activeShift.id.slice(0, 6)}</span>
            </button>
          ) : (
            <button
              onClick={() => setOpeningShiftOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Open Shift (Step 2)
            </button>
          )}

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400 text-xs font-bold">
              {currentUser.full_name.charAt(0)}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-bold text-slate-200 truncate max-w-[120px]">
                {currentUser.full_name}
              </p>
              <p className="text-[10px] text-slate-500 uppercase font-mono">{currentUser.role}</p>
            </div>
            <button
              onClick={() => logout()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 transition ml-1"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Authoritative Workflow Step Indicator Bar */}
      <div className="bg-slate-950 border-b border-slate-800/80 px-4 py-1.5 flex items-center justify-between text-[10px] text-slate-400 overflow-x-auto whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-300 uppercase tracking-wider">
            Authoritative POS Workflow:
          </span>
          <div className="flex items-center gap-1">
            {workflowSteps.map(st => {
              const isActive = activeWorkflowStep === st.num;
              return (
                <span
                  key={st.num}
                  className={`px-2 py-0.5 rounded-md font-mono transition ${
                    isActive
                      ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {st.num}. {st.label}
                </span>
              );
            })}
          </div>
        </div>

        <span className="text-slate-500 font-mono hidden xl:inline">
          IndexedDB Source of Truth &bull; Zero Network Dependency for Sales
        </span>
      </div>

      {/* Main Workspace Body */}
      <main className="flex-1 p-4 overflow-hidden flex flex-col">
        {activeView === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 h-[calc(100vh-8.5rem)]">
            {/* Catalog Area (Steps 5 & 6) */}
            <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
              <ProductCatalog onProceedToReviewCart={() => setPaymentModalOpen(true)} />
            </div>

            {/* Cart & Review Area (Steps 8 & 9) */}
            <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
              <CartReview
                onProceedToPayment={() => setPaymentModalOpen(true)}
                onOpenCustomerModal={() => setCustomerModalOpen(true)}
              />
            </div>
          </div>
        )}

        {activeView === 'dashboard' && (
          <div className="flex-1 overflow-y-auto pr-1">
            <Dashboard onOpenSyncModal={() => setIsSyncModalOpen(true)} />
          </div>
        )}

        {activeView === 'inventory' && (
          <div className="flex-1 overflow-y-auto pr-1">
            <InventoryManager />
          </div>
        )}

        {activeView === 'reports' && (
          <div className="flex-1 overflow-y-auto pr-1">
            <ReportsView />
          </div>
        )}
      </main>

      {/* Decision & Modal Overlays */}
      {isOpeningShiftOpen && <OpenShiftModal />}
      {isClosingShiftOpen && <CloseShiftModal onClose={() => setClosingShiftOpen(false)} />}
      {isCustomerModalOpen && <CustomerSelector onClose={() => setCustomerModalOpen(false)} />}
      <ProductNotFoundModal />
      <StockAlertModal />

      {isPaymentModalOpen && (
        <PaymentModal
          onClose={() => setPaymentModalOpen(false)}
          onPaymentSuccess={() => {
            setPaymentModalOpen(false);
            setReceiptModalOpen(true);
          }}
        />
      )}

      {isReceiptModalOpen && (
        <ReceiptModal
          onClose={() => setReceiptModalOpen(false)}
          onProceedToCompleted={() => {
            setReceiptModalOpen(false);
            setIsSuccessModalOpen(true);
          }}
        />
      )}

      {isSuccessModalOpen && (
        <SaleSuccessModal
          onClose={() => setIsSuccessModalOpen(false)}
          onNextCustomer={() => {
            setIsSuccessModalOpen(false);
            startNewSale(); // Authoritative Step 17 -> Step 4 Next Customer instant reset
          }}
        />
      )}

      {isSyncModalOpen && <SyncStatusModal onClose={() => setIsSyncModalOpen(false)} />}
    </div>
  );
}

export default App;
