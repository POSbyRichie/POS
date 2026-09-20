import {
  Zap,
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

interface HeaderProps {
  onOpenSyncModal: () => void;
}

export function Header({ onOpenSyncModal }: HeaderProps) {
  const { currentPath, navigate } = useRouter();
  const { currentUser, activeRegister, logout } = usePos();
  const [showInstallBtn, setShowInstallBtn] = useState<boolean>(false);

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

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between shadow-md shrink-0 gap-2">
      {/* Brand */}
      <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => navigate('/dashboard')}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-emerald-500 flex items-center justify-center font-black text-slate-950 shadow-md shadow-sky-500/20">
          <Zap className="w-5 h-5 fill-slate-950" />
        </div>
        <div className="hidden lg:block">
          <h1 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
            ANTIGRAVITY POS
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
              PRO
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 font-mono">
            {activeRegister ? activeRegister.register_name : 'Terminal 01'} &bull; Main Counter
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex items-center gap-0.5 sm:gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800 text-xs font-semibold overflow-x-auto scrollbar-none">
        {navLinks.map(link => {
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
                  ? 'bg-sky-600 text-white shadow-sm font-bold'
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
            className="hidden xl:flex items-center gap-1 px-2.5 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-lg text-xs font-bold transition hover:bg-emerald-900"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}

        {currentUser && (
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <div className="hidden sm:block text-left">
              <span className="font-bold text-slate-200 block text-[11px] leading-tight truncate max-w-[90px]">
                {currentUser.full_name}
              </span>
              <span className="text-[9px] text-slate-400 uppercase font-mono tracking-wider">
                {currentUser.role}
              </span>
            </div>
            <button
              type="button"
              title="Lock / Switch Cashier"
              onClick={() => logout()}
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition"
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
