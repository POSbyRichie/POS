import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  KeyRound,
  AlertCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  Terminal,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  ShieldCheck,
  User,
  Store,
  X,
  Loader2,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { db } from '../../db';
import { User as UserType, Register, Store as StoreType } from '../../types';
import { usePos } from '../../store/posStore';
import { authService, CachedOfflineUser } from '../../services/authService';
import { deviceService, DeviceStatus } from '../../services/deviceService';
import { connectivityService } from '../../services/connectivity';
import { DeviceEnrollmentModal } from './DeviceEnrollmentModal';
import { InitialSetupModal } from './InitialSetupModal';
import { useRouter } from '../../routes/router';

export const LoginModal: React.FC = () => {
  const { navigate } = useRouter();
  const {
    setCurrentUser,
    setActiveShift,
    setActiveRegister,
    setActiveDevice,
    setOpeningShiftOpen,
    setActiveWorkflowStep,
    setActiveView,
  } = usePos();

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState<boolean>(false);
  const [activeStore, setActiveStore] = useState<StoreType | null>(null);
  const [needsInitialSetup, setNeedsInitialSetup] = useState<boolean>(false);
  const [users, setUsers] = useState<UserType[]>([]);
  const [cachedUsers, setCachedUsers] = useState<CachedOfflineUser[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(connectivityService.isOnline());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadInitialState();
    const unsub = connectivityService.subscribe(() => {
      setIsOnline(connectivityService.isOnline());
    });
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      unsub();
      clearInterval(clockTimer);
    };
  }, []);

  const loadInitialState = async () => {
    const status = await deviceService.getDeviceStatus();
    setDeviceStatus(status);

    const [rawUsers, rawRegisters, cached, store] = await Promise.all([
      db.users.toArray(),
      db.registers.toArray(),
      authService.getCachedOfflineUsers(),
      db.stores.toCollection().first(),
    ]);

    const allUsers = rawUsers.filter(u => u.is_active !== false);
    const allRegisters = rawRegisters.filter(r => r.is_active !== false);

    setUsers(allUsers);
    setRegisters(allRegisters);
    setCachedUsers(cached);
    setActiveStore(store || null);

    if (allUsers.length === 0) {
      setNeedsInitialSetup(true);
      setShowEnrollmentModal(false);
      return;
    } else {
      setNeedsInitialSetup(false);
    }

    if (!status.isEnrolled) {
      setShowEnrollmentModal(true);
    }

    if (allUsers.length > 0) {
      setSelectedUser(allUsers[0]);
    }

    if (status.device) {
      setSelectedRegisterId(status.device.register_id);
    } else if (allRegisters.length > 0) {
      setSelectedRegisterId(allRegisters[0].id);
    }
  };

  const handleDeviceEnrolled = async () => {
    setShowEnrollmentModal(false);
    await loadInitialState();
  };

  const handleKeypadPress = (val: string) => {
    if (pin.length < 16) {
      setPin(prev => prev + val);
      setError('');
    }
    pinInputRef.current?.focus();
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
    pinInputRef.current?.focus();
  };

  const handleClear = () => {
    setPin('');
    setError('');
    pinInputRef.current?.focus();
  };

  const formatAuthError = (rawError: string): string => {
    if (!rawError) return '';
    if (rawError.includes('INCORRECT_PIN')) {
      return 'Incorrect PIN or password. Please verify your credentials and try again.';
    }
    if (rawError.includes('USER_NOT_FOUND')) {
      return 'Staff account not found. Please choose an active operator from the directory.';
    }
    if (rawError.includes('ACCOUNT_INACTIVE')) {
      return 'This staff account has been deactivated. Please contact your store manager.';
    }
    if (rawError.includes('USER_NOT_AUTHORIZED_OFFLINE')) {
      return 'This cashier has not signed in online on this terminal yet. Please connect online for the first sign-in.';
    }
    if (rawError.includes('DEVICE_NOT_ENROLLED')) {
      return 'This terminal is not yet enrolled in the store register network. Setup required.';
    }
    if (rawError.includes('REGISTER_INACTIVE')) {
      return 'The selected register terminal is currently inactive. Please choose an active counter.';
    }
    return rawError.replace(/^[A-Z0-9_]+:\s*/, '');
  };

  const handleLoginSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    if (isVerifying) return;
    if (!selectedUser) {
      setError('Please select an authorized staff member.');
      return;
    }
    if (!pin) {
      setError('Please enter your access PIN or password.');
      pinInputRef.current?.focus();
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // Execute the multi-stage authentication pipeline via authService
      const result = await authService.login({
        username: selectedUser.username,
        pin,
        registerId: selectedRegisterId,
      });

      // Update POS global state with authenticated cashier, register and device
      setCurrentUser(result.user);
      setActiveRegister(result.register);
      setActiveDevice(result.device);

      // Check if there is an active open shift on this register
      const existingShift = await db.shifts
        .where('status')
        .equals('open')
        .and(s => s.register_id === result.register.id)
        .first();

      if (existingShift) {
        // Resume existing open shift
        setActiveShift(existingShift);
        if (result.user.role === 'cashier') {
          setActiveWorkflowStep(4);
          setActiveView('pos');
          navigate('/pos');
        } else if (result.user.role === 'inventory_manager') {
          setActiveWorkflowStep(3);
          setActiveView('inventory');
          navigate('/inventory');
        } else {
          setActiveWorkflowStep(3);
          setActiveView('dashboard');
          navigate('/dashboard');
        }
      } else {
        // No open shift on this register
        if (result.user.role === 'cashier') {
          // Cashier proceeds to open shift
          setActiveWorkflowStep(2);
          setOpeningShiftOpen(true);
        } else if (result.user.role === 'inventory_manager') {
          // Inventory manager proceeds to inventory management
          setActiveWorkflowStep(3);
          setActiveView('inventory');
          navigate('/inventory');
        } else {
          // Manager or admin proceeds to management dashboard
          setActiveWorkflowStep(3);
          setActiveView('dashboard');
          navigate('/dashboard');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed.';
      setError(formatAuthError(message));
      setPin('');
      pinInputRef.current?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  if (showEnrollmentModal) {
    return <DeviceEnrollmentModal onEnrolled={handleDeviceEnrolled} />;
  }

  const isSelectedUserCached = selectedUser
    ? cachedUsers.some(c => c.id === selectedUser.id || c.username === selectedUser.username)
    : false;

  const formattedDate = currentTime.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = currentTime.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'cashier':
        return {
          label: 'Cashier',
          bg: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80',
          avatarBg: 'bg-emerald-600 text-white',
        };
      case 'manager':
        return {
          label: 'Store Manager',
          bg: 'bg-sky-950/80 text-sky-400 border-sky-800/80',
          avatarBg: 'bg-sky-600 text-white',
        };
      case 'admin':
        return {
          label: 'System Admin',
          bg: 'bg-purple-950/80 text-purple-400 border-purple-800/80',
          avatarBg: 'bg-purple-600 text-white',
        };
      case 'inventory_manager':
        return {
          label: 'Inventory',
          bg: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
          avatarBg: 'bg-amber-600 text-white',
        };
      default:
        return {
          label: role.toUpperCase(),
          bg: 'bg-slate-800 text-slate-300 border-slate-700',
          avatarBg: 'bg-slate-700 text-white',
        };
    }
  };

  const selectedRoleMeta = selectedUser ? getRoleBadge(selectedUser.role) : null;

  if (needsInitialSetup) {
    return (
      <InitialSetupModal
        onComplete={async () => {
          setNeedsInitialSetup(false);
          await loadInitialState();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-sky-500 selection:text-white">
      {/* Top Enterprise Workstation Telemetry Bar */}
      <header className="border-b border-slate-800/90 bg-slate-900/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
        {/* Brand & Store Identity */}
        <div className="flex items-center gap-3.5">
          <img
            src="/logo-icon.png"
            alt="RichiePOS Logo"
            className="w-10 h-10 rounded-xl object-contain shadow-md border border-slate-700/80 bg-slate-950 p-1 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-1 leading-none">
                <span>Richie</span>
                <span className="text-amber-400">POS</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/70 ml-1">
                  ENTERPRISE
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
              <Store className="w-3.5 h-3.5 text-slate-500" />
              <span>{activeStore?.name ? `${activeStore.name} • Retail Station` : 'Branch #101 • Retail Checkout Station'}</span>
            </p>
          </div>
        </div>

        {/* Real-time Workstation Telemetry Badges */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          {/* Hardware Device Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-slate-400 text-[11px]">Workstation:</span>
            <span className="font-mono font-medium text-slate-200 truncate max-w-[140px]">
              {deviceStatus?.device?.device_name || 'Counter Terminal-01'}
            </span>
          </div>

          {/* Online / Offline Sync State */}
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${
              isOnline
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                : 'bg-amber-950/60 text-amber-400 border-amber-800/80'
            }`}
          >
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <Wifi className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Cloud Synchronized</span>
                <span className="md:hidden">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Offline Standalone Mode</span>
                <span className="md:hidden">Offline</span>
              </>
            )}
          </div>

          {/* Live Workstation Clock */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden lg:inline text-slate-400">{formattedDate}</span>
            <span className="hidden lg:inline text-slate-600">&bull;</span>
            <span className="font-semibold text-slate-200">{formattedTime}</span>
          </div>
        </div>
      </header>

      {/* Main Workstation Sign-In Canvas */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl bg-slate-900 border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          {/* Left Console: Register & Staff Selection (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950/60 p-6 sm:p-7 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between">
            <div>
              {/* Register Selector Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="register-select" className="text-xs font-bold text-slate-300 tracking-wider uppercase flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-sky-400" />
                    <span>Register Terminal</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    {registers.length} {registers.length === 1 ? 'Station' : 'Stations'} Active
                  </span>
                </div>
                <div className="relative">
                  <select
                    id="register-select"
                    value={selectedRegisterId}
                    onChange={e => setSelectedRegisterId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded-xl text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition shadow-inner"
                  >
                    {registers.map(reg => (
                      <option key={reg.id} value={reg.id}>
                        {reg.register_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Staff Directory Section */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-bold text-slate-300 tracking-wider uppercase flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Authorized Operators</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">Select to sign in</span>
                </div>

                <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
                  {users.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800/60">
                      No authorized operators found.
                    </div>
                  ) : (
                    users.map(u => {
                    const isCached = cachedUsers.some(c => c.id === u.id || c.username === u.username);
                    const isSelected = selectedUser?.id === u.id;
                    const meta = getRoleBadge(u.role);

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setPin('');
                          setError('');
                          pinInputRef.current?.focus();
                        }}
                        className={`w-full text-left p-3 rounded-xl transition-all duration-150 flex items-center justify-between border cursor-pointer ${
                          isSelected
                            ? 'bg-sky-950/70 border-sky-500/80 shadow-md ring-1 ring-sky-500/50 text-white'
                            : 'bg-slate-900/60 border-slate-800/90 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${
                              isSelected ? meta.avatarBg : 'bg-slate-800 text-slate-200'
                            }`}
                          >
                            {u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs leading-snug truncate">
                              {u.full_name || u.username}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full border ${meta.bg}`}>
                                {meta.label}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">@{u.username}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {isCached && (
                            <span
                              title="Offline authentication authorized"
                              className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/70 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="hidden sm:inline">Offline Ready</span>
                            </span>
                          )}
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${
                              isSelected ? 'text-sky-400 translate-x-0.5' : 'text-slate-600'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  }))}
                </div>
              </div>
            </div>

            {/* Workstation Security Footprint */}
            <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Encrypted POS Session</span>
              </span>
              <span className="font-mono text-slate-400">Ver 2.4.0</span>
            </div>
          </div>

          {/* Right Console: Secure PIN Authentication & Keypad (7 cols) */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between bg-slate-900/90">
            <div>
              {/* Workstation Header */}
              <div className="mb-5">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block mb-1">
                  Workstation Sign In
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Terminal Authentication
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Authenticate your operator credentials to open a register session.
                </p>
              </div>

              {/* Active Operator Banner */}
              {selectedUser && selectedRoleMeta && (
                <div className="mb-5 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-3 shadow-inner">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shadow-sm shrink-0 ${selectedRoleMeta.avatarBg}`}
                    >
                      {selectedUser.full_name ? selectedUser.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white truncate">
                          {selectedUser.full_name || selectedUser.username}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${selectedRoleMeta.bg}`}>
                          {selectedRoleMeta.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Username: <span className="text-slate-200">@{selectedUser.username}</span>
                      </p>
                    </div>
                  </div>

                  {!isOnline && !isSelectedUserCached && (
                    <span className="text-[10px] bg-rose-950/80 text-rose-300 border border-rose-800 px-2.5 py-1 rounded-lg font-bold shrink-0 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      <span>Not Cached</span>
                    </span>
                  )}
                </div>
              )}

              {/* Offline Warning Callout */}
              {!isOnline && !isSelectedUserCached && (
                <div className="p-3 mb-4 bg-amber-950/60 border border-amber-800/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-300">Online Setup Required</p>
                    <p className="text-[11px] text-amber-200/90 mt-0.5">
                      This operator has not signed in online on this terminal yet. Initial authentication must be performed with an active internet connection.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 mb-4 bg-rose-950/70 border border-rose-800/90 text-rose-200 text-xs rounded-xl animate-in fade-in duration-150"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-rose-300">Authentication Failed</p>
                    <p className="text-[11px] text-rose-200/90 mt-0.5">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    className="text-rose-400 hover:text-rose-200 p-1 rounded-md transition"
                    aria-label="Dismiss error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Authentication Form with Keyboard Support */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="pin-input"
                      className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5 text-sky-400" />
                      <span>Security PIN / Password</span>
                    </label>
                    <span className="text-[11px] text-slate-400">Physical keyboard or touch keypad</span>
                  </div>

                  <div className="relative">
                    <input
                      id="pin-input"
                      ref={pinInputRef}
                      type={showPin ? 'text' : 'password'}
                      value={pin}
                      onChange={e => {
                        setPin(e.target.value);
                        setError('');
                      }}
                      placeholder="Enter access PIN or password"
                      autoFocus
                      autoComplete="current-password"
                      className="w-full h-12 pl-4 pr-24 bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-xl text-white placeholder-slate-500 font-mono tracking-wider text-base focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition shadow-inner"
                    />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {pin && (
                        <button
                          type="button"
                          onClick={handleClear}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                          title="Clear input"
                          aria-label="Clear PIN input"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                        title={showPin ? 'Hide PIN' : 'Show PIN'}
                        aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tactile Touch Keypad for Commercial POS Terminals */}
                <div className="pt-1">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleKeypadPress(String(num))}
                        className="h-11 sm:h-12 bg-slate-800/90 hover:bg-slate-700/90 active:bg-sky-600 active:text-white border border-slate-700/60 rounded-xl text-base font-bold text-white transition-all shadow-sm flex items-center justify-center cursor-pointer select-none"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleClear}
                      className="h-11 sm:h-12 bg-slate-800/50 hover:bg-slate-800 hover:text-rose-400 border border-slate-700/40 text-slate-400 rounded-xl text-xs font-bold tracking-wider transition-colors flex items-center justify-center cursor-pointer select-none"
                    >
                      CLEAR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      className="h-11 sm:h-12 bg-slate-800/90 hover:bg-slate-700/90 active:bg-sky-600 active:text-white border border-slate-700/60 rounded-xl text-base font-bold text-white transition-all shadow-sm flex items-center justify-center cursor-pointer select-none"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleBackspace}
                      className="h-11 sm:h-12 bg-slate-800/50 hover:bg-slate-800 hover:text-amber-400 border border-slate-700/40 text-slate-400 rounded-xl text-xs font-bold transition-colors flex items-center justify-center cursor-pointer select-none"
                      aria-label="Backspace"
                    >
                      &larr; BACK
                    </button>
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isVerifying || pin.length === 0}
                    onClick={handleLoginSubmit}
                    className="w-full h-12 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Credentials...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>Sign In to Terminal</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Helper & Support Hints */}
            <div className="mt-5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="text-slate-400">
                Enter your authorized 4–6 digit security PIN to open session
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                <span>Need assistance? Contact supervisor</span>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Workstation Footer Notice */}
      <footer className="px-4 sm:px-8 py-2.5 border-t border-slate-800/70 bg-slate-950 text-slate-500 text-[11px] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <span>RichiePOS Workstation v2.4.0 &bull; Licensed Enterprise Edition</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>Database Online &bull; Dexie v4 Local Cache</span>
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline">{activeStore?.name || 'Authorized Store Workstation'}</span>
        </div>
      </footer>
    </div>
  );
};
