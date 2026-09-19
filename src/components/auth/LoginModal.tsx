import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, Shield, AlertCircle } from 'lucide-react';
import { db } from '../../db';
import { User, Device } from '../../types';
import { verifyPin } from '../../utils/id';
import { usePos } from '../../store/posStore';

export const LoginModal: React.FC = () => {
  const { setCurrentUser, setActiveShift, setOpeningShiftOpen, setActiveWorkflowStep, setActiveView } = usePos();
  const [users, setUsers] = useState<User[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  useEffect(() => {
    loadUsersAndDevice();
  }, []);

  const loadUsersAndDevice = async () => {
    const allUsers = await db.users.where('is_active').equals(1).toArray();
    setUsers(allUsers);
    if (allUsers.length > 0) {
      setSelectedUser(allUsers[0]);
    }

    const currentDevice = await db.devices.get('dev-pos-terminal-01');
    setDevice(currentDevice || null);
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
      setError('Please select a user account.');
      return;
    }
    if (!pin) {
      setError('Please enter your PIN.');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const isValid = await verifyPin(pin, selectedUser.salt, selectedUser.pin_hash);
      if (!isValid) {
        setError('Incorrect PIN. Please try again.');
        setPin('');
        setIsVerifying(false);
        return;
      }

      // Check if there is an active open shift on this register
      const existingShift = await db.shifts.where('status').equals('open').first();

      setCurrentUser(selectedUser);

      if (existingShift) {
        // Resume existing shift
        setActiveShift(existingShift);
        setActiveWorkflowStep(3); // Dashboard
        setActiveView('pos');
      } else {
        // Step 2: Proceed to Open Shift
        setActiveWorkflowStep(2);
        setOpeningShiftOpen(true);
      }
    } catch {
      setError('Authentication failed. Please verify offline authorization.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Left Column: User Selection & Terminal Info */}
        <div className="w-full md:w-5/12 bg-slate-950/60 p-6 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sky-400 font-bold text-lg mb-1">
              <Shield className="w-5 h-5 text-sky-400" />
              <span>CASHIER LOGIN</span>
            </div>
            <p className="text-xs text-slate-400 mb-5">Authoritative Step 1 &bull; Offline Auth</p>

            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
              Select Cashier / Staff
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {users.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setSelectedUser(u);
                    setPin('');
                    setError('');
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center gap-3 transition border ${
                    selectedUser?.id === u.id
                      ? 'bg-sky-950/80 border-sky-500 text-sky-200 font-semibold shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                      selectedUser?.id === u.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {u.full_name.charAt(0)}
                  </div>
                  <div className="truncate">
                    <p className="font-medium truncate">{u.full_name}</p>
                    <p className="text-[10px] uppercase text-slate-500 font-mono tracking-wider">{u.role}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Terminal:</span>
              <span className="font-mono text-slate-400">{device?.id || 'TERMINAL-01'}</span>
            </div>
            <div className="flex justify-between">
              <span>Security:</span>
              <span className="text-emerald-400 font-medium">Salted WebCrypto Offline</span>
            </div>
          </div>
        </div>

        {/* Right Column: PIN Keypad */}
        <div className="w-full md:w-7/12 p-6 flex flex-col justify-between">
          <div>
            <div className="text-center mb-4">
              <span className="text-xs text-slate-400">Authenticate as</span>
              <h3 className="text-base font-bold text-white truncate">{selectedUser?.full_name || 'Select Cashier'}</h3>
              <p className="text-xs text-sky-400 font-mono mt-0.5">Role: {selectedUser?.role?.toUpperCase()}</p>
            </div>

            {/* PIN Display Dots */}
            <div className="flex justify-center items-center gap-3 mb-4 bg-slate-950/80 py-3 rounded-xl border border-slate-800">
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
              <div className="flex items-center gap-2 p-2 mb-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-lg animate-shake">
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
                  className="h-12 bg-slate-800 hover:bg-slate-700 active:bg-sky-600 active:text-white rounded-xl text-lg font-bold text-slate-100 transition shadow-sm"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="h-12 bg-slate-800/60 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="h-12 bg-slate-800 hover:bg-slate-700 active:bg-sky-600 active:text-white rounded-xl text-lg font-bold text-slate-100 transition shadow-sm"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-12 bg-slate-800/60 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                &larr;
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              disabled={isVerifying || pin.length === 0}
              onClick={() => handleLoginSubmit()}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              {isVerifying ? 'Verifying PIN...' : 'LOG IN TO REGISTER'}
            </button>
            <p className="text-center text-[10px] text-slate-500">
              Demo PINs: Cashier: 1234 &bull; Manager: 5555 &bull; Admin: 9999
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
