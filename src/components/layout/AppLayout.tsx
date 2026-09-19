import { ReactNode } from 'react';
import { Header } from './Header';
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
      <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100 selection:bg-sky-500 selection:text-white">
        <Header onOpenSyncModal={onOpenSyncModal} />
        <SyncBanner onOpenSyncModal={onOpenSyncModal} />
        <main className="flex-1 p-4 overflow-hidden flex flex-col">
          <WorkflowStepper />
          {children}
        </main>
      </div>
    </ErrorBoundary>
  );
}
