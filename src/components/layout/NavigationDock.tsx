import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  LayoutGrid,
  Clock,
  RotateCcw,
  Calculator,
  Settings,
  User as UserIcon,
  Layers,
  ShoppingBag,
  Package,
  Users,
  Calendar,
  BarChart3,
  Shield,
  Server,
  LogOut,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { useRouter, RoutePath } from '../../routes/router';
import { connectivityService } from '../../services/connectivity';
import { syncEngine } from '../../sync';

interface NavigationDockProps {
  onOpenSyncModal: () => void;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({ onOpenSyncModal }) => {
  const {
    currentUser,
    suspendedSales,
    setSuspendedSalesOpen,
    setCalculatorOpen,
    logout,
  } = usePos();
  const { currentPath, navigate } = useRouter();

  const [isAppMenuOpen, setIsAppMenuOpen] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const isOnline = connectivityService.isOnline();

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncEngine.processQueue();
    } finally {
      setIsSyncing(false);
    }
  };

  const navItems: { path: RoutePath; label: string; icon: React.FC<{ className?: string }> }[] = [
    { path: '/dashboard', label: 'Dashboard', icon: Layers },
    { path: '/pos', label: 'Sales / Register', icon: ShoppingBag },
    { path: '/inventory', label: 'Inventory', icon: Package },
    { path: '/customers', label: 'Customers & Loyalty', icon: Users },
    { path: '/shifts', label: 'Shifts & Drawer', icon: Calendar },
    { path: '/reports', label: 'Financial Reports', icon: BarChart3 },
    { path: '/admin', label: 'Administration', icon: Shield },
    { path: '/system', label: 'System & Sync', icon: Server },
  ];

  return (
    <aside className="w-16 bg-slate-950 border-r border-slate-900 flex flex-col items-center justify-between py-3 shrink-0 select-none z-30">
      {/* Top Controls */}
      <div className="flex flex-col items-center gap-4 w-full">
        {/* 1. Network / Online Indicator */}
        <button
          type="button"
          onClick={onOpenSyncModal}
          title={isOnline ? 'Internet Connected (Click for Sync Center)' : 'Offline Mode (Local-first IndexedDB)'}
          className="relative p-2.5 rounded-2xl transition hover:bg-slate-900 active:scale-95 group"
        >
          {isOnline ? (
            <div className="relative">
              <Wifi className="w-5 h-5 text-emerald-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-pulse" />
            </div>
          ) : (
            <div className="relative">
              <WifiOff className="w-5 h-5 text-amber-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-950" />
            </div>
          )}
        </button>

        {/* 2. 9-Dot App Grid Launcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsAppMenuOpen(!isAppMenuOpen);
              setIsUserMenuOpen(false);
            }}
            title="Application Navigation"
            className={`p-2.5 rounded-2xl transition active:scale-95 ${
              isAppMenuOpen
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          {/* App Grid Launcher Dropdown Popover */}
          {isAppMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsAppMenuOpen(false)}
              />
              <div className="absolute left-16 top-0 ml-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
                <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">POS Modules</p>
                </div>
                <div className="space-y-1">
                  {navItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPath === item.path || (item.path === '/pos' && currentPath === '/sales');
                    return (
                      <button
                        key={item.path}
                        onClick={() => {
                          navigate(item.path);
                          setIsAppMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 3. Suspend / Parked Sales */}
        <button
          type="button"
          onClick={() => setSuspendedSalesOpen(true)}
          title={`Suspended Sales (${suspendedSales.length})`}
          className="relative p-2.5 rounded-2xl text-slate-400 hover:text-amber-400 hover:bg-slate-900 transition active:scale-95"
        >
          <Clock className="w-5 h-5" />
          {suspendedSales.length > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold shadow-md">
              {suspendedSales.length}
            </span>
          )}
        </button>

        {/* 4. Sync / Refresh */}
        <button
          type="button"
          onClick={handleManualSync}
          title="Manual Sync / Check Cloud Status"
          className="p-2.5 rounded-2xl text-slate-400 hover:text-sky-400 hover:bg-slate-900 transition active:scale-95"
        >
          <RotateCcw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
        </button>

        {/* 5. Calculator */}
        <button
          type="button"
          onClick={() => setCalculatorOpen(true)}
          title="Cashier Calculator"
          className="p-2.5 rounded-2xl text-slate-400 hover:text-indigo-400 hover:bg-slate-900 transition active:scale-95"
        >
          <Calculator className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Settings Gear */}
        <button
          type="button"
          onClick={() => navigate('/settings')}
          title="Administration & Settings"
          className={`p-2.5 rounded-2xl transition active:scale-95 ${
            currentPath === '/settings' || currentPath === '/admin' || currentPath === '/administration'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Cashier Avatar Profile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsAppMenuOpen(false);
            }}
            title={currentUser ? `${currentUser.full_name || currentUser.name} (${currentUser.role})` : 'User Profile'}
            className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 flex items-center justify-center text-slate-300 font-bold transition active:scale-95"
          >
            {currentUser ? (
              <span className="text-xs font-bold text-indigo-300">
                {(currentUser.full_name || currentUser.name || 'U').charAt(0).toUpperCase()}
              </span>
            ) : (
              <UserIcon className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* Cashier Menu Dropdown */}
          {isUserMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsUserMenuOpen(false)}
              />
              <div className="absolute left-16 bottom-0 ml-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
                <div className="border-b border-slate-800/80 pb-2 mb-2">
                  <p className="text-xs font-bold text-white truncate">
                    {currentUser?.full_name || currentUser?.name || 'Cashier'}
                  </p>
                  <p className="text-[10px] text-indigo-400 font-mono uppercase mt-0.5">
                    Role: {currentUser?.role || 'user'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-950/40 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Lock / Logout</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
