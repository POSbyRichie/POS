import {
  ShoppingCart,
  LayoutDashboard,
  Package,
  Users,
  Clock,
  BarChart3,
  Shield,
  Activity,
  Download,
  LogOut,
  UserCheck,
} from 'lucide-react';
import { useRouter, RoutePath } from '../../routes/router';
import { OfflineIndicator } from '../dashboard/OfflineIndicator';
import { canInstallPwa, promptPwaInstall } from '../../services/pwa';
import { usePos } from '../../store/posStore';
import { useState, useEffect } from 'react';
import { isRouteAllowed, getRoleHomeRoute } from '../../utils/rbac';

interface HeaderProps {
  onOpenSyncModal: () => void;
}

export function Header({ onOpenSyncModal }: HeaderProps) {
  const { currentPath, navigate } = useRouter();
  const { currentUser, activeRegister, setUserProfileOpen, logout } = usePos();
  const [showInstallBtn, setShowInstallBtn] = useState<boolean>(false);

  const isCashierWorkspace = currentUser?.role === 'cashier' || currentPath === '/pos' || currentPath === '/sales';

  useEffect(() => {
    setShowInstallBtn(canInstallPwa());
  }, []);

  const navLinks: { path: RoutePath; aliases?: RoutePath[]; label: string; icon: any }[] = [
    { path: '/dashboard', aliases: ['/'], label: 'Dashboard', icon: LayoutDashboard },
    { path: '/sales', aliases: ['/pos'], label: 'Sales', icon: ShoppingCart },
    { path: '/inventory', label: 'Inventory', icon: Package },
    { path: '/customers', label: 'Customers', icon: Users },
    { path: '/shifts', label: 'Shifts', icon: Clock },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/admin', aliases: ['/administration', '/settings'], label: 'Admin', icon: Shield },
    { path: '/system', label: 'System', icon: Activity },
  ];

  const visibleNavLinks = navLinks.filter(link => isRouteAllowed(currentUser?.role, link.path));

  return (
    <header
      className={`h-14 sm:h-16 px-2 sm:px-4 flex items-center justify-between shadow-sm shrink-0 gap-2 ${
        isCashierWorkspace
          ? 'bg-white border-b border-slate-200 text-slate-800'
          : 'bg-slate-900 border-b border-slate-800 text-white shadow-md'
      }`}
    >
      {/* Brand */}
      <div
        className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0"
        onClick={() => navigate(getRoleHomeRoute(currentUser?.role))}
      >
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shadow-sm flex items-center justify-center p-0.5 ${
            isCashierWorkspace
              ? 'border border-slate-200 bg-white'
              : 'border border-slate-700/80 bg-slate-950 shadow-amber-500/10'
          }`}
        >
          <img
            src="/logo-icon.png"
            alt="RichiePOS Logo"
            className="w-full h-full object-contain rounded-lg"
          />
        </div>
        <div className="hidden lg:block">
          <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
            <span className={isCashierWorkspace ? 'text-slate-900 font-extrabold' : 'text-white font-extrabold'}>
              Richie
            </span>
            <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 bg-clip-text text-transparent font-black">
              POS
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                isCashierWorkspace
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
              }`}
            >
              SUIT
            </span>
          </h1>
          <p
            className={`text-[11px] font-mono ${
              isCashierWorkspace ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            {activeRegister ? activeRegister.register_name : 'Terminal 01'} &bull; Main Counter
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        className={`flex items-center gap-0.5 sm:gap-1 p-1 rounded-xl text-xs font-semibold overflow-x-auto scrollbar-none ${
          isCashierWorkspace
            ? 'bg-slate-100 border border-slate-200'
            : 'bg-slate-950/70 border border-slate-800'
        }`}
      >
        {visibleNavLinks.map(link => {
          const Icon = link.icon;
          const isActive =
            currentPath === link.path ||
            (link.aliases && link.aliases.includes(currentPath));

          return (
            <button
              key={link.path}
              type="button"
              onClick={() => navigate(link.path)}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm font-bold'
                  : isCashierWorkspace
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{link.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cashier Authentication & Telemetry */}
      <div className="flex items-center gap-2 shrink-0">
        {showInstallBtn && (
          <button
            type="button"
            onClick={promptPwaInstall}
            className="hidden xl:flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition hover:bg-emerald-100"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}

        {currentUser && (
          <div
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs ${
              isCashierWorkspace
                ? 'bg-slate-50 border border-slate-200 text-slate-800'
                : 'bg-slate-950 border border-slate-800 text-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setUserProfileOpen(true)}
              title="Edit Profile & Password"
              className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer text-left"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <div className="hidden sm:block text-left">
                <span
                  className={`font-bold block text-[11px] leading-tight truncate max-w-[90px] ${
                    isCashierWorkspace ? 'text-slate-800' : 'text-slate-200'
                  }`}
                >
                  {currentUser.full_name}
                </span>
                <span
                  className={`text-[9px] uppercase font-mono tracking-wider ${
                    isCashierWorkspace ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
            </button>
            <button
              type="button"
              title="Lock / Switch Cashier"
              onClick={() => logout()}
              className={`p-1 rounded transition ml-1 ${
                isCashierWorkspace
                  ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <OfflineIndicator onOpenSyncModal={onOpenSyncModal} />
      </div>
    </header>
  );
}
