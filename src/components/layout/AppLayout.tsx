import { ReactNode } from 'react';
import { Header } from './Header';
import { NavigationDock } from './NavigationDock';
import { SyncBanner } from './SyncBanner';
import { WorkflowStepper } from './WorkflowStepper';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface AppLayoutProps {
  children: ReactNode;
  onOpenSyncModal: () => void;
}

export function AppLayout({ children, onOpenSyncModal }: AppLayoutProps) {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 flex text-slate-100 selection:bg-indigo-500 selection:text-white overflow-hidden">
        {/* Left Vertical Dock matching inspiration */}
        <NavigationDock onOpenSyncModal={onOpenSyncModal} />

        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Header onOpenSyncModal={onOpenSyncModal} />
          <SyncBanner onOpenSyncModal={onOpenSyncModal} />
          <main className="flex-1 p-2 lg:p-3 pb-16 md:pb-3 overflow-hidden flex flex-col min-w-0">
            <WorkflowStepper />
            {children}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
