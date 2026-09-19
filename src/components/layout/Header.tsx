import { Zap, ShoppingCart, LayoutDashboard, Package, BarChart3, Settings, Download } from 'lucide-react';
import { useRouter, RoutePath } from '../../routes/router';
import { OfflineIndicator } from '../dashboard/OfflineIndicator';
import { canInstallPwa, promptPwaInstall } from '../../services/pwa';
import { useState, useEffect } from 'react';

interface HeaderProps {
  onOpenSyncModal: () => void;
}

export function Header({ onOpenSyncModal }: HeaderProps) {
  const { currentPath, navigate } = useRouter();
  const [showInstallBtn, setShowInstallBtn] = useState<boolean>(false);

  useEffect(() => {
    setShowInstallBtn(canInstallPwa());
  }, []);

  const navLinks: { path: RoutePath; label: string; icon: any }[] = [
    { path: '/pos', label: 'POS Terminal', icon: ShoppingCart },
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/inventory', label: 'Inventory', icon: Package },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shadow-md shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-emerald-500 flex items-center justify-center font-black text-slate-950 shadow-md shadow-sky-500/20">
          <Zap className="w-5 h-5 fill-slate-950" />
        </div>
        <div>
          <h1 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
            ANTIGRAVITY POS
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
              PHASE 1
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 font-mono">Terminal 01 &bull; Main Counter</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="hidden md:flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
        {navLinks.map(link => {
          const Icon = link.icon;
          const isActive = currentPath === link.path || (link.path === '/dashboard' && currentPath === '/');
          return (
            <button
              key={link.path}
              type="button"
              onClick={() => navigate(link.path)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                isActive
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {link.label}
            </button>
          );
        })}
      </nav>

      {/* Telemetry & PWA Install */}
      <div className="flex items-center gap-3">
        {showInstallBtn && (
          <button
            type="button"
            onClick={promptPwaInstall}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-lg text-xs font-bold transition hover:bg-emerald-900"
          >
            <Download className="w-3 h-3" />
            Install PWA
          </button>
        )}

        <OfflineIndicator onOpenSyncModal={onOpenSyncModal} />
      </div>
    </header>
  );
}
