import { ReactNode } from 'react';
import { Header } from './Header';
import { NavigationDock } from './NavigationDock';
import { SyncBanner } from './SyncBanner';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { usePos } from '../../store/posStore';
import { useRouter } from '../../routes/router';

interface AppLayoutProps {
  children: ReactNode;
  onOpenSyncModal: () => void;
}

export function AppLayout({ children, onOpenSyncModal }: AppLayoutProps) {
  const { currentUser } = usePos();
  const { currentPath } = useRouter();
  const isCashierWorkspace = currentUser?.role === 'cashier' || currentPath === '/pos' || currentPath === '/sales';
  const isSalesRoute = currentPath === '/pos' || currentPath === '/sales';

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 flex text-slate-100 selection:bg-indigo-500 selection:text-white overflow-hidden">
        {/* Left Vertical Dock matching inspiration */}
        <NavigationDock onOpenSyncModal={onOpenSyncModal} />

        {/* Main Workspace Area */}
        <div className={`flex-1 flex flex-col min-w-0 h-screen overflow-hidden ${isCashierWorkspace ? 'bg-[#f4f5f8]' : ''}`}>
          {!isSalesRoute && <Header onOpenSyncModal={onOpenSyncModal} />}
          {!isSalesRoute && <SyncBanner onOpenSyncModal={onOpenSyncModal} />}
          <main className={`flex-1 ${isSalesRoute ? 'p-0 overflow-hidden' : 'p-2 lg:p-3 pb-16 md:pb-3 overflow-y-auto'} flex flex-col min-w-0 ${isCashierWorkspace ? 'bg-[#f4f5f8] text-slate-800' : ''}`}>
            {children}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

