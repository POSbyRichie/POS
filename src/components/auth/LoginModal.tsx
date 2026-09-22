import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  KeyRound,
  AlertCircle,
  AlertTriangle,
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
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          avatarBg: 'bg-emerald-600 text-white',
        };
      case 'manager':
        return {
          label: 'Store Manager',
          bg: 'bg-sky-50 text-sky-700 border-sky-200',
          avatarBg: 'bg-sky-600 text-white',
        };
      case 'admin':
        return {
          label: 'System Admin',
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          avatarBg: 'bg-purple-600 text-white',
        };
      case 'inventory_manager':
        return {
          label: 'Inventory',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          avatarBg: 'bg-amber-600 text-white',
        };
      default:
        return {
          label: role.toUpperCase(),
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-amber-500 selection:text-white">
      {/* Top Enterprise Workstation Telemetry Bar */}
      <header className="border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
        {/* Brand & Store Identity */}
        <div className="flex items-center gap-3.5">
          <img
            src="/richiepos-suit-logo.jpg"
            alt="RichiePOS Suit Logo"
            className="w-11 h-11 rounded-xl object-contain shadow-sm border border-slate-200 bg-slate-950 p-0.5 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1 leading-none">
                <span>Richie</span>
                <span className="text-amber-600">POS</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 ml-1">
                  ENTERPRISE
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              <span>{activeStore?.name ? `${activeStore.name} • Retail Station` : 'Branch #101 • Retail Station'}</span>
            </p>
          </div>
        </div>

        {/* Real-time Workstation Telemetry Badges */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          {/* Hardware Device Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-700">
            <Terminal className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span className="text-slate-500 text-[11px]">Workstation:</span>
            <span className="font-mono font-semibold text-slate-800 truncate max-w-[140px]">
              {deviceStatus?.device?.device_name || 'Counter Terminal-01'}
            </span>
          </div>

          {/* Live Workstation Clock */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/90 border border-slate-200 font-mono text-xs text-slate-700">
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden lg:inline text-slate-500">{formattedDate}</span>
            <span className="hidden lg:inline text-slate-400">•</span>
            <span className="font-semibold text-slate-900">{formattedTime}</span>
          </div>
        </div>
      </header>

      {/* Main Workstation Sign-In Canvas */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl bg-white border border-slate-200/90 rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          {/* Left Console: Register & Staff Selection (5 cols) */}
          <div className="lg:col-span-5 bg-slate-50/70 p-6 sm:p-7 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
            <div>
              {/* Register Selector Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="register-select" className="text-xs font-bold text-slate-700 tracking-wider uppercase flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-sky-600" />
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
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition shadow-sm"
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
                  <label className="text-xs font-bold text-slate-700 tracking-wider uppercase flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Authorized Operators</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">Select to sign in</span>
                </div>

                <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
                  {users.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
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
                              ? 'bg-amber-50/90 border-amber-500 shadow-md ring-2 ring-amber-500/30 text-slate-900'
                              : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-100/80 hover:border-slate-300 hover:text-slate-900 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${
                                isSelected ? meta.avatarBg : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-xs leading-snug truncate text-slate-900">
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
                                className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span className="hidden sm:inline">Offline Ready</span>
                              </span>
                            )}
                            <ChevronRight
                              className={`w-4 h-4 transition-transform ${
                                isSelected ? 'text-amber-600 translate-x-0.5' : 'text-slate-400'
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Workstation Security Footprint */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-medium text-slate-600">Encrypted POS Session</span>
              </span>
              <span className="font-mono text-slate-400 font-medium">Ver 2.4.0</span>
            </div>
          </div>

          {/* Right Console: Secure PIN Authentication & Keypad (7 cols) */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between bg-white">
            <div>
              {/* Brand Logo Hero Header */}
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-100">
                <div className="relative shrink-0">
                  <img
                    src="/richiepos-suit-logo.jpg"
                    alt="RichiePOS Suit - Smart POS. Growing Businesses."
                    className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl object-cover shadow-md shadow-amber-500/10 border border-slate-200 bg-slate-950 p-1"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-amber-600 uppercase tracking-widest">
                      RichiePOS Suit
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      Terminal Sign In
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    Operator Authentication
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    SMART POS. GROWING BUSINESSES.
                  </p>
                </div>
              </div>

              {/* Active Operator Banner */}
              {selectedUser && selectedRoleMeta && (
                <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shadow-sm shrink-0 ${selectedRoleMeta.avatarBg}`}
                    >
                      {selectedUser.full_name ? selectedUser.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {selectedUser.full_name || selectedUser.username}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${selectedRoleMeta.bg}`}>
                          {selectedRoleMeta.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Username: <span className="text-slate-800 font-semibold">@{selectedUser.username}</span>
                      </p>
                    </div>
                  </div>

                  {!isOnline && !isSelectedUserCached && (
                    <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-lg font-bold shrink-0 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-500" />
                      <span>Not Cached</span>
                    </span>
                  )}
                </div>
              )}

              {/* Offline Warning Callout */}
              {!isOnline && !isSelectedUserCached && (
                <div className="p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-950">Online Setup Required</p>
                    <p className="text-[11px] text-amber-800/90 mt-0.5">
                      This operator has not signed in online on this terminal yet. Initial authentication must be performed with an active internet connection.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 mb-4 bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-xl animate-in fade-in duration-150 shadow-sm"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-rose-950">Authentication Failed</p>
                    <p className="text-[11px] text-rose-800 mt-0.5">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    className="text-rose-500 hover:text-rose-700 p-1 rounded-md transition cursor-pointer"
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
                      className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Security PIN / Password</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">Physical keyboard or touch keypad</span>
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
                      className="w-full h-12 pl-4 pr-24 bg-white border-2 border-slate-300 hover:border-slate-400 rounded-xl text-slate-900 placeholder-slate-400 font-mono tracking-wider text-base focus:outline-none focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition shadow-sm"
                    />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {pin && (
                        <button
                          type="button"
                          onClick={handleClear}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                          title="Clear input"
                          aria-label="Clear PIN input"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
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
                        className="h-11 sm:h-12 bg-slate-50 hover:bg-slate-100 active:bg-amber-500 active:text-white border border-slate-200 rounded-xl text-base font-bold text-slate-800 transition-all shadow-sm flex items-center justify-center cursor-pointer select-none"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleClear}
                      className="h-11 sm:h-12 bg-slate-100/70 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold tracking-wider transition-colors flex items-center justify-center cursor-pointer select-none"
                    >
                      CLEAR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      className="h-11 sm:h-12 bg-slate-50 hover:bg-slate-100 active:bg-amber-500 active:text-white border border-slate-200 rounded-xl text-base font-bold text-slate-800 transition-all shadow-sm flex items-center justify-center cursor-pointer select-none"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleBackspace}
                      className="h-11 sm:h-12 bg-slate-100/70 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors flex items-center justify-center cursor-pointer select-none"
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
                    className="w-full h-12 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-600 hover:to-orange-700 active:from-amber-700 active:to-orange-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer"
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
            <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Enter your authorized 4–6 digit security PIN to open session</span>
              <span className="flex items-center gap-1 text-slate-500">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>Need assistance? Contact supervisor</span>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Workstation Footer Notice */}
      <footer className="px-4 sm:px-8 py-3 border-t border-slate-200/90 bg-white text-slate-500 text-[11px] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <span>RichiePOS Workstation v2.4.0 &bull; Licensed Enterprise Edition</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-sm" />
            <span>Database Online &bull; Dexie v4 Local Cache</span>
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="hidden sm:inline font-medium text-slate-600">{activeStore?.name || 'Authorized Store Workstation'}</span>
        </div>
      </footer>
    </div>
  );
};
