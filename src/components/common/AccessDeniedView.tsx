import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { UserRole } from '../../types';
import { RoutePath, useRouter } from '../../routes/router';
import { getRoleHomeRoute } from '../../utils/rbac';

interface AccessDeniedViewProps {
  path?: RoutePath;
  userRole?: UserRole | null;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({ path, userRole }) => {
  const { navigate } = useRouter();
  const homeRoute = getRoleHomeRoute(userRole);

  const getWorkspaceName = (role?: UserRole | null) => {
    switch (role) {
      case 'cashier':
        return 'Sales & Register';
      case 'inventory_manager':
        return 'Inventory Management';
      case 'manager':
        return 'Manager Dashboard';
      case 'admin':
        return 'Admin Dashboard';
      default:
        return 'Dashboard';
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/50">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800 mb-2">
            <Lock className="w-3 h-3" /> Permission Restricted
          </span>
          <h2 className="text-xl font-black text-white tracking-tight">Access Denied</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Your account role (<span className="text-rose-300 font-bold uppercase font-mono">{userRole || 'Unknown'}</span>)
            does not have permission to access {path ? <code className="text-slate-200 bg-slate-950 px-1.5 py-0.5 rounded font-mono">{path}</code> : 'this module'}.
          </p>
        </div>

        <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800/80 text-xs text-slate-400 text-left space-y-1">
          <div className="flex justify-between">
            <span>Required Clearance:</span>
            <span className="font-semibold text-slate-200">Management / Admin</span>
          </div>
          <div className="flex justify-between">
            <span>Authorized Zone:</span>
            <span className="font-semibold text-emerald-400">{getWorkspaceName(userRole)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate(homeRoute)}
          className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to {getWorkspaceName(userRole)}</span>
        </button>
      </div>
    </div>
  );
};
