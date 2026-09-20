import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  LayoutGrid,
  Save,
  RotateCcw,
  Calculator,
  Settings,
  User as UserIcon,
  UserCog,
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
import { isRouteAllowed, getRoleHomeRoute } from '../../utils/rbac';

interface NavigationDockProps {
  onOpenSyncModal: () => void;
}


export const NavigationDock: React.FC<NavigationDockProps> = ({ onOpenSyncModal }) => {
  const {
    currentUser,
    suspendedSales,
    setSuspendedSalesOpen,
    setCalculatorOpen,
    setUserProfileOpen,
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

  const visibleNavItems = navItems.filter(item => isRouteAllowed(currentUser?.role, item.path));

  const isSalesRoute = currentPath === '/pos' || currentPath === '/sales';

  return (
    <>
      <aside className="hidden md:flex w-14 sm:w-16 bg-[#181920] border-r border-[#242634] flex-col items-center justify-between py-3 shrink-0 select-none z-30">
      {/* Top Controls */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Brand Logo - Shown on non-sales routes */}
        {!isSalesRoute && (
          <button
            type="button"
            onClick={() => navigate(getRoleHomeRoute(currentUser?.role))}
            title="RichiePOS Dashboard"
            className="w-9 h-9 rounded-xl overflow-hidden shadow-lg border border-slate-800/80 bg-slate-900 flex items-center justify-center p-1 transition hover:scale-105 active:scale-95 group mb-1"
          >
            <img
              src="/logo-icon.png"
              alt="RichiePOS"
              className="w-full h-full object-contain rounded-lg"
            />
          </button>
        )}

        {/* 1. Network / Online Indicator */}
        <button
          type="button"
          onClick={onOpenSyncModal}
          title={isOnline ? 'Online • Connected' : 'Offline Mode'}
          className="relative p-2 rounded-xl transition hover:bg-slate-800/60 active:scale-95 group"
        >
          {isOnline ? (
            <div className="relative">
              <Wifi className="w-5 h-5 text-emerald-400" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-[#181920] animate-pulse" />
            </div>
          ) : (
            <div className="relative">
              <WifiOff className="w-5 h-5 text-amber-400" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 ring-2 ring-[#181920]" />
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
            className={`p-2 rounded-xl transition active:scale-95 ${
              isAppMenuOpen
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
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
                  {visibleNavItems.map(item => {
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

        {/* 3. Suspend / Parked Sales (Floppy Disk Save icon matching photo) */}
        <button
          type="button"
          onClick={() => setSuspendedSalesOpen(true)}
          title={`Suspended Sales (${suspendedSales.length})`}
          className="relative p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 transition active:scale-95"
        >
          <Save className="w-5 h-5" />
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
          className="p-2 rounded-xl text-slate-400 hover:text-sky-400 hover:bg-slate-800/60 transition active:scale-95"
        >
          <RotateCcw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
        </button>

        {/* 5. Calculator */}
        <button
          type="button"
          onClick={() => setCalculatorOpen(true)}
          title="Cashier Calculator"
          className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-slate-800/60 transition active:scale-95"
        >
          <Calculator className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-3 w-full pb-1">
        {/* Settings Gear */}
        <button
          type="button"
          onClick={() => navigate(isRouteAllowed(currentUser?.role, '/settings') ? '/settings' : '/system')}
          title="System Settings"
          className={`p-2 rounded-xl transition active:scale-95 ${
            currentPath === '/settings' || currentPath === '/admin' || currentPath === '/system'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Cashier Profile Avatar (Circular outline with user silhouette matching photo) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsAppMenuOpen(false);
            }}
            title={currentUser ? `${currentUser.full_name || currentUser.name} (${currentUser.role})` : 'User Profile'}
            className="p-1 rounded-full transition active:scale-95 text-slate-400 hover:text-white"
          >
            <div className="w-7 h-7 rounded-full border border-slate-400/80 flex items-center justify-center hover:border-white transition">
              <UserIcon className="w-4 h-4 text-slate-300" />
            </div>
          </button>

          {/* Cashier Menu Dropdown */}
          {isUserMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsUserMenuOpen(false)}
              />
              <div className="absolute left-16 bottom-0 ml-2 w-60 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
                <div className="border-b border-slate-800/80 pb-2 mb-2">
                  <p className="text-xs font-bold text-white truncate">
                    {currentUser?.full_name || currentUser?.name || 'Cashier'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                    @{currentUser?.username || 'user'} &bull; <span className="text-indigo-400 uppercase font-bold">{currentUser?.role || 'staff'}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setUserProfileOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer mb-1"
                >
                  <UserCog className="w-4 h-4 text-indigo-400" />
                  <span>Edit Profile & PIN</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Lock / Logout</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>

    {/* Mobile Bottom Dock (< md) */}
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 z-40 flex items-center justify-around px-2 select-none shadow-2xl">
      {/* 1. Network / Sync Modal */}
      <button
        type="button"
        onClick={onOpenSyncModal}
        className="p-2 rounded-xl text-slate-400 hover:text-white active:scale-95 transition"
        title={isOnline ? 'Online' : 'Offline'}
      >
        {isOnline ? (
          <div className="relative">
            <Wifi className="w-5 h-5 text-emerald-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        ) : (
          <div className="relative">
            <WifiOff className="w-5 h-5 text-amber-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
          </div>
        )}
      </button>

      {/* 2. 9-Dot Launcher Popover Trigger */}
      <button
        type="button"
        onClick={() => {
          setIsAppMenuOpen(!isAppMenuOpen);
          setIsUserMenuOpen(false);
        }}
        className={`p-2 rounded-xl active:scale-95 transition ${
          isAppMenuOpen ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
        title="Modules"
      >
        <LayoutGrid className="w-5 h-5" />
      </button>

      {/* 3. Sales / Register */}
      <button
        type="button"
        onClick={() => navigate('/pos')}
        className={`p-2 rounded-xl active:scale-95 transition ${
          currentPath === '/pos' || currentPath === '/sales' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
        }`}
        title="POS Sales Register"
      >
        <ShoppingBag className="w-5 h-5" />
      </button>

      {/* 4. Held / Suspended Sales */}
      <button
        type="button"
        onClick={() => setSuspendedSalesOpen(true)}
        className="relative p-2 rounded-xl text-slate-400 hover:text-white active:scale-95 transition"
        title="Parked Sales"
      >
        <Save className="w-5 h-5" />
        {suspendedSales.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[9px] flex items-center justify-center font-mono shadow-sm">
            {suspendedSales.length}
          </span>
        )}
      </button>

      {/* 5. Calculator */}
      <button
        type="button"
        onClick={() => setCalculatorOpen(true)}
        className="p-2 rounded-xl text-slate-400 hover:text-white active:scale-95 transition"
        title="Calculator"
      >
        <Calculator className="w-5 h-5" />
      </button>

      {/* 6. User Avatar */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsUserMenuOpen(!isUserMenuOpen);
            setIsAppMenuOpen(false);
          }}
          className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-indigo-300 font-bold text-xs active:scale-95 transition"
          title="User Profile"
        >
          {(currentUser?.full_name || currentUser?.name || 'U').charAt(0).toUpperCase()}
        </button>

        {/* Mobile User Popover */}
        {isUserMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsUserMenuOpen(false)}
            />
            <div className="absolute right-0 bottom-12 mb-2 w-60 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in duration-150">
              <div className="border-b border-slate-800/80 pb-2 mb-2">
                <p className="text-xs font-bold text-white truncate">
                  {currentUser?.full_name || currentUser?.name || 'Cashier'}
                </p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                  @{currentUser?.username || 'user'} &bull; <span className="text-indigo-400 uppercase font-bold">{currentUser?.role || 'staff'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setUserProfileOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer mb-1"
              >
                <UserCog className="w-4 h-4 text-indigo-400" />
                <span>Edit Profile & PIN</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Lock / Logout</span>
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  </>
  );
};
