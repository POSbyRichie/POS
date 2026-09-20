import { useState, useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { Route, useRouter } from './routes/router';
import { seedDatabase } from './db/seed';

// Components
import { Dashboard } from './components/dashboard/Dashboard';
import { SalesView } from './components/sales/SalesView';
import { CustomerSelector } from './components/pos/CustomerSelector';
import { PaymentModal } from './components/pos/PaymentModal';
import { ReceiptModal } from './components/pos/ReceiptModal';
import { SaleSuccessModal } from './components/pos/SaleSuccessModal';
import { ProductNotFoundModal } from './components/pos/ProductNotFoundModal';
import { StockAlertModal } from './components/pos/StockAlertModal';
import { SyncStatusModal } from './components/sync/SyncStatusModal';
import { InventoryManager } from './components/inventory/InventoryManager';
import { CustomersView } from './components/customers/CustomersView';
import { ShiftsView } from './components/shift/ShiftsView';
import { ReportsView } from './components/reports/ReportsView';
import { AdministrationView } from './components/admin/AdministrationView';
import { SystemView } from './components/system/SystemView';
import { LoginModal } from './components/auth/LoginModal';
import { OpenShiftModal } from './components/shift/OpenShiftModal';
import { CloseShiftModal } from './components/shift/CloseShiftModal';
import { CalculatorModal } from './components/pos/CalculatorModal';
import { SuspendedSalesModal } from './components/pos/SuspendedSalesModal';
import { IssueLoyaltyCardModal } from './components/pos/IssueLoyaltyCardModal';
import { usePos } from './store/posStore';

export function App() {
  const {
    currentUser,
    activeShift,
    isOpeningShiftOpen,
    isClosingShiftOpen,
    isPaymentModalOpen,
    isReceiptModalOpen,
    isCustomerModalOpen,
    isSuspendedSalesOpen,
    isCalculatorOpen,
    isIssueLoyaltyCardOpen,
    setActiveWorkflowStep,
    proceedToNextCustomer,
    setClosingShiftOpen,
    setPaymentModalOpen,
    setReceiptModalOpen,
    setCustomerModalOpen,
    setSuspendedSalesOpen,
    setCalculatorOpen,
    setIssueLoyaltyCardOpen,
  } = usePos();

  const { navigate } = useRouter();
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-4">
        <div className="relative mb-4">
          <img
            src="/logo-icon.png"
            alt="RichiePOS Logo"
            className="w-16 h-16 rounded-2xl object-contain shadow-2xl shadow-amber-500/20 border border-slate-800 bg-slate-900 p-1"
          />
          <div className="absolute -inset-1 rounded-2xl border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
        </div>
        <h2 className="text-base font-black text-white flex items-center gap-1">
          <span>Richie</span>
          <span className="text-amber-400">POS</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold ml-1">
            SUIT
          </span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">Smart POS &bull; Growing Businesses</p>
        <p className="text-[11px] text-slate-500 font-mono mt-3">Verifying local-first database...</p>
      </div>
    );
  }

  // Step 1 Check
  if (!currentUser) {
    return <LoginModal />;
  }

  // Step 2 Check
  if (!activeShift && isOpeningShiftOpen) {
    return <OpenShiftModal />;
  }

  return (
    <AppLayout onOpenSyncModal={() => setIsSyncModalOpen(true)}>
      {/* 1. Route: Dashboard */}
      <Route path="/">
        <div className="flex-1 overflow-y-auto pr-1">
          <Dashboard onOpenSyncModal={() => setIsSyncModalOpen(true)} />
        </div>
      </Route>

      <Route path="/dashboard">
        <div className="flex-1 overflow-y-auto pr-1">
          <Dashboard onOpenSyncModal={() => setIsSyncModalOpen(true)} />
        </div>
      </Route>

      {/* 2. Route: Sales (New Sale, Scan, Search, Cart, Customer, Payment, Receipt) */}
      <Route path="/sales">
        <SalesView />
      </Route>

      <Route path="/pos">
        <SalesView />
      </Route>

      {/* 3. Route: Inventory (Products, Categories, Stock, Stock In, Adjustments, Low Stock) */}
      <Route path="/inventory">
        <div className="flex-1 overflow-y-auto pr-1">
          <InventoryManager />
        </div>
      </Route>

      {/* 4. Route: Customers (Customers Directory & Loyalty Points Audit Trail) */}
      <Route path="/customers">
        <div className="flex-1 overflow-y-auto pr-1">
          <CustomersView />
        </div>
      </Route>

      {/* 5. Route: Shifts (Open Shift, Current Shift Metrics & Movements, Close Shift Variance) */}
      <Route path="/shifts">
        <div className="flex-1 overflow-y-auto pr-1">
          <ShiftsView />
        </div>
      </Route>

      {/* 6. Route: Reports (Sales, Inventory, Cashier, Payments, Shifts) */}
      <Route path="/reports">
        <div className="flex-1 overflow-y-auto pr-1">
          <ReportsView />
        </div>
      </Route>

      {/* 7. Route: Administration (Users, Roles, Registers, Devices, Settings) */}
      <Route path="/admin">
        <div className="flex-1 overflow-y-auto pr-1">
          <AdministrationView />
        </div>
      </Route>

      <Route path="/administration">
        <div className="flex-1 overflow-y-auto pr-1">
          <AdministrationView />
        </div>
      </Route>

      <Route path="/settings">
        <div className="flex-1 overflow-y-auto pr-1">
          <AdministrationView />
        </div>
      </Route>

      {/* 8. Route: System (Offline Status, Sync Center, Sync Errors, Audit Logs) */}
      <Route path="/system">
        <div className="flex-1 overflow-y-auto pr-1">
          <SystemView />
        </div>
      </Route>

      {/* Overlays & Modals */}
      {isClosingShiftOpen && (
        <CloseShiftModal
          onClose={() => {
            setClosingShiftOpen(false);
            setActiveWorkflowStep(3);
          }}
        />
      )}
      {isCustomerModalOpen && (
        <CustomerSelector
          onClose={() => {
            setCustomerModalOpen(false);
            setActiveWorkflowStep(8);
          }}
        />
      )}
      <ProductNotFoundModal />
      <StockAlertModal />

      {isPaymentModalOpen && (
        <PaymentModal
          onClose={() => {
            setPaymentModalOpen(false);
            setActiveWorkflowStep(8);
          }}
          onPaymentSuccess={() => {
            setPaymentModalOpen(false);
            setReceiptModalOpen(true);
            setActiveWorkflowStep(12);
          }}
        />
      )}

      {isReceiptModalOpen && (
        <ReceiptModal
          onClose={() => {
            setReceiptModalOpen(false);
            setActiveWorkflowStep(8);
          }}
          onProceedToCompleted={() => {
            setReceiptModalOpen(false);
            setIsSuccessModalOpen(true);
            setActiveWorkflowStep(16);
          }}
        />
      )}

      {isSuccessModalOpen && (
        <SaleSuccessModal
          onClose={() => setIsSuccessModalOpen(false)}
          onNextCustomer={() => {
            setIsSuccessModalOpen(false);
            proceedToNextCustomer();
            navigate('/pos');
          }}
        />
      )}

      {isSyncModalOpen && <SyncStatusModal onClose={() => setIsSyncModalOpen(false)} />}
      {isSuspendedSalesOpen && <SuspendedSalesModal onClose={() => setSuspendedSalesOpen(false)} />}
      {isCalculatorOpen && <CalculatorModal onClose={() => setCalculatorOpen(false)} />}
      {isIssueLoyaltyCardOpen && <IssueLoyaltyCardModal onClose={() => setIssueLoyaltyCardOpen(false)} />}
    </AppLayout>
  );
}

export default App;
