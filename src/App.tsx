import { useState, useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { Route, useRouter } from './routes/router';
import { seedDatabase } from './db/seed';

// Components
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
import { SettingsView } from './components/views/SettingsView';
import { LoginModal } from './components/auth/LoginModal';
import { OpenShiftModal } from './components/shift/OpenShiftModal';
import { CloseShiftModal } from './components/shift/CloseShiftModal';
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
    setClosingShiftOpen,
    setPaymentModalOpen,
    setReceiptModalOpen,
    setCustomerModalOpen,
    startNewSale,
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold">Initializing Antigravity POS Architecture...</p>
        <p className="text-xs text-slate-500 mt-1">Phase 1 Foundation &bull; Verifying local database</p>
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
      {/* Route: Home / Dashboard */}
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

      {/* Route: POS Terminal (Steps 4-17) */}
      <Route path="/pos">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 h-[calc(100vh-6.5rem)]">
          <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
            <ProductCatalog onProceedToReviewCart={() => setPaymentModalOpen(true)} />
          </div>
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
            <CartReview
              onProceedToPayment={() => setPaymentModalOpen(true)}
              onOpenCustomerModal={() => setCustomerModalOpen(true)}
            />
          </div>
        </div>
      </Route>

      {/* Route: Inventory Management */}
      <Route path="/inventory">
        <div className="flex-1 overflow-y-auto pr-1">
          <InventoryManager />
        </div>
      </Route>

      {/* Route: Reports */}
      <Route path="/reports">
        <div className="flex-1 overflow-y-auto pr-1">
          <ReportsView />
        </div>
      </Route>

      {/* Route: Settings & Environment Diagnostics */}
      <Route path="/settings">
        <div className="flex-1 overflow-y-auto pr-1">
          <SettingsView />
        </div>
      </Route>

      {/* Overlays & Modals */}
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
            startNewSale();
            navigate('/pos');
          }}
        />
      )}

      {isSyncModalOpen && <SyncStatusModal onClose={() => setIsSyncModalOpen(false)} />}
    </AppLayout>
  );
}

export default App;
