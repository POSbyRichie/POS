import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, Shield, AlertCircle, AlertTriangle, Wifi, WifiOff, Terminal } from 'lucide-react';
import { db } from '../../db';
import { User, Register } from '../../types';
import { usePos } from '../../store/posStore';
import { authService, CachedOfflineUser } from '../../services/authService';
import { deviceService, DeviceStatus } from '../../services/deviceService';
import { connectivityService } from '../../services/connectivity';
import { DeviceEnrollmentModal } from './DeviceEnrollmentModal';

export const LoginModal: React.FC = () => {
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
  const [users, setUsers] = useState<User[]>([]);
  const [cachedUsers, setCachedUsers] = useState<CachedOfflineUser[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(connectivityService.isOnline());

  useEffect(() => {
    loadInitialState();
    const unsub = connectivityService.subscribe(() => {
      setIsOnline(connectivityService.isOnline());
    });
    return unsub;
  }, []);

  const loadInitialState = async () => {
    const status = await deviceService.getDeviceStatus();
    setDeviceStatus(status);

    if (!status.isEnrolled) {
      setShowEnrollmentModal(true);
    }

    const [rawUsers, rawRegisters, cached] = await Promise.all([
      db.users.toArray(),
      db.registers.toArray(),
      authService.getCachedOfflineUsers(),
    ]);

    const allUsers = rawUsers.filter(u => u.is_active !== false);
    const allRegisters = rawRegisters.filter(r => r.is_active !== false);

    setUsers(allUsers);
    setRegisters(allRegisters);
    setCachedUsers(cached);

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
    if (pin.length < 8) {
      setPin(prev => prev + val);
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedUser) {
      setError('Please select a cashier account.');
      return;
    }
    if (!pin) {
      setError('Please enter your PIN.');
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

      // Update POS global state with authenticated cashier and register
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
        setActiveWorkflowStep(3); // Dashboard
        setActiveView('pos');
      } else {
        // Step 2: Proceed to Open Shift
        setActiveWorkflowStep(2);
        setOpeningShiftOpen(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
      setPin('');
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Left Column: Device Status, User Selection & Register */}
        <div className="w-full md:w-5/12 bg-slate-950/70 p-4 sm:p-6 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Header & Connectivity Badge */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-base">
                <Shield className="w-4 h-4 text-sky-400" />
                <span>POS LOGIN</span>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isOnline
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              {isOnline
                ? 'Online verification & offline credential caching enabled'
                : 'Offline mode: Authorized cached staff only'}
            </p>

            {/* Register Selection */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Register Terminal
              </label>
              <select
                value={selectedRegisterId}
                onChange={e => setSelectedRegisterId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
              >
                {registers.map(reg => (
                  <option key={reg.id} value={reg.id}>
                    {reg.register_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Cashier Selection */}
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
              Select Cashier / Staff
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {users.map(u => {
                const isCached = cachedUsers.some(c => c.id === u.id || c.username === u.username);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setPin('');
                      setError('');
                    }}
                    className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition border ${
                      selectedUser?.id === u.id
                        ? 'bg-sky-950/80 border-sky-500 text-sky-200 font-semibold shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          selectedUser?.id === u.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {u.full_name.charAt(0)}
                      </div>
                      <div className="truncate">
                        <p className="font-medium truncate leading-tight">{u.full_name}</p>
                        <p className="text-[10px] uppercase text-slate-500 font-mono">{u.role}</p>
                      </div>
                    </div>
                    {isCached && (
                      <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                        Cached
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Terminal & Hardware Badge */}
          <div className="mt-3 pt-3 border-t border-slate-800/80 text-[10px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Terminal className="w-3 h-3 text-sky-400" />
                <span>Device:</span>
              </span>
              <span className="font-mono text-slate-300 font-semibold truncate max-w-[130px]">
                {deviceStatus?.device?.device_name || 'Enrolled Terminal'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Security Lease:</span>
              <span className="text-emerald-400 font-medium">Salted WebCrypto SHA-256</span>
            </div>
          </div>
        </div>

        {/* Right Column: PIN Keypad */}
        <div className="w-full md:w-7/12 p-4 sm:p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="text-center mb-3">
              <span className="text-xs text-slate-400">Authenticating as</span>
              <h3 className="text-base font-bold text-white truncate">{selectedUser?.full_name || 'Select Cashier'}</h3>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-[11px] bg-sky-950 text-sky-400 border border-sky-800 px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                  {selectedUser?.role || 'CASHIER'}
                </span>
                {!isOnline && !isSelectedUserCached && (
                  <span className="text-[10px] bg-rose-950 text-rose-400 border border-rose-800 px-2 py-0.5 rounded-full font-bold">
                    Not Cached Offline
                  </span>
                )}
              </div>
            </div>

            {/* Offline warning if user not cached */}
            {!isOnline && !isSelectedUserCached && (
              <div className="p-2.5 mb-3 bg-amber-950/60 border border-amber-800/80 rounded-xl flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  This cashier has not authenticated online on this terminal. First setup must be performed while online.
                </span>
              </div>
            )}

            {/* PIN Display Dots */}
            <div className="flex justify-center items-center gap-3 mb-3 bg-slate-950/80 py-2.5 rounded-xl border border-slate-800">
              <Lock className="w-4 h-4 text-slate-500 mr-1" />
              {[0, 1, 2, 3].map(index => (
                <div
                  key={index}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    pin.length > index ? 'bg-sky-400 scale-110 shadow-sm shadow-sky-400/50' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 mb-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(String(num))}
                  className="h-11 bg-slate-800 hover:bg-slate-700 active:bg-sky-600 active:text-white rounded-xl text-base font-bold text-slate-100 transition shadow-sm"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="h-11 bg-slate-800/60 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="h-11 bg-slate-800 hover:bg-slate-700 active:bg-sky-600 active:text-white rounded-xl text-base font-bold text-slate-100 transition shadow-sm"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-11 bg-slate-800/60 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                &larr;
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              disabled={isVerifying || pin.length === 0}
              onClick={() => handleLoginSubmit()}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isVerifying ? 'Verifying Credentials...' : 'AUTHENTICATE & ENTER REGISTER'}</span>
            </button>
            <p className="text-center text-[10px] text-slate-500">
              Demo PIN: 1234 &bull; Admin / Cashier Salted PBKDF2 Verification
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
