import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { db } from '../../db';
import { Register, Store } from '../../types';
import { deviceService } from '../../services/deviceService';
import { connectivityService } from '../../services/connectivity';

interface DeviceEnrollmentModalProps {
  onEnrolled: () => void;
}

export const DeviceEnrollmentModal: React.FC<DeviceEnrollmentModalProps> = ({ onEnrolled }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [registers, setRegisters] = useState<Register[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('Counter Terminal 01');
  const [isOnline, setIsOnline] = useState<boolean>(connectivityService.isOnline());
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const fingerprint = deviceService.getFingerprint();

  useEffect(() => {
    loadStoresAndRegisters();
    const unsub = connectivityService.subscribe(() => {
      setIsOnline(connectivityService.isOnline());
    });
    return unsub;
  }, []);

  const loadStoresAndRegisters = async () => {
    let [allStores, allRegisters] = await Promise.all([
      db.stores.toArray(),
      db.registers.toArray(),
    ]);

    // Self-heal store if empty
    if (allStores.length === 0) {
      const defaultStore: Store = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Kampala Flagship Store',
        code: 'KLA-01',
        tagline: 'Enterprise Point of Sale',
        address: 'Plot 12 Kampala Road, Kampala, Uganda',
        phone: '+256 700 000000',
        email: 'info@posbyrichie.online',
        tax_id: 'TAX-UG-100200',
        currency_code: 'UGX',
        currency_symbol: 'UGX',
        currency_decimals: 0,
        loyalty_rate: 100,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.stores.put(defaultStore);
      allStores = [defaultStore];
    }

    // Filter active registers or self-heal
    let activeRegs = allRegisters.filter(r => r.is_active !== false);
    if (activeRegs.length === 0) {
      const defaultRegister: Register = {
        id: 'reg-001-main',
        register_name: 'Register 01 (Main Counter)',
        branch_name: 'Kampala Flagship Store',
        is_active: true,
      };
      await db.registers.put(defaultRegister);
      activeRegs = [defaultRegister];
    }

    setStores(allStores);
    setRegisters(activeRegs);
    if (allStores.length > 0) {
      setSelectedStoreId(allStores[0].id);
    }
    if (activeRegs.length > 0) {
      setSelectedRegisterId(activeRegs[0].id);
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRegisterId) {
      setError('Please select a register to pair with this terminal.');
      return;
    }

    if (!deviceName.trim()) {
      setError('Please provide a terminal name.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await deviceService.enrollDevice({
        registerId: selectedRegisterId,
        deviceName: deviceName.trim(),
        storeId: selectedStoreId,
      });
      onEnrolled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Device enrollment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAutoEnroll = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      let regId = selectedRegisterId;
      if (!regId) {
        const firstReg = await db.registers.toCollection().first();
        regId = firstReg ? firstReg.id : 'reg-001-main';
      }

      await deviceService.enrollDevice({
        registerId: regId,
        deviceName: deviceName || 'Counter Terminal 01',
        storeId: selectedStoreId || '00000000-0000-0000-0000-000000000001',
      });
      onEnrolled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Auto-configuration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 text-slate-900">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <img
                src="/richiepos-suit-logo.jpg"
                alt="RichiePOS Suit Logo"
                className="w-10 h-10 rounded-xl object-contain shadow-sm border border-slate-200 bg-slate-950 p-0.5"
              />
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1">
                  <span>Richie</span>
                  <span className="text-amber-600">POS</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold ml-0.5">
                    SUIT
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">Terminal Enrollment</p>
              </div>
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900">Register Hardware Pairing</h3>
          <p className="text-xs text-slate-500 mt-1">
            Pair this hardware device with a physical register to enable local-first POS operations.
          </p>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleEnrollSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {!isOnline && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <span className="font-bold block">Offline Mode</span>
                Working without internet. This terminal will initialize locally and synchronize automatically once reconnected.
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Auto-Enroll Banner */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">Default Terminal Setup</p>
              <p className="text-[11px] text-slate-500 truncate">Pair with Register 01 (Main Counter)</p>
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleQuickAutoEnroll}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-semibold text-xs rounded-xl border border-slate-300 shadow-sm flex items-center gap-1.5 transition shrink-0 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Auto-Assign</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Hardware Fingerprint ID</label>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 truncate">
              {fingerprint}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Terminal Name</label>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder="e.g. Counter Terminal 01"
              className="w-full px-3 py-2.5 bg-white border border-slate-300 hover:border-slate-400 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-sm"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Target Store Branch</label>
            <select
              value={selectedStoreId}
              onChange={e => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 hover:border-slate-400 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 shadow-sm"
            >
              {stores.length === 0 ? (
                <option value="00000000-0000-0000-0000-000000000001">Kampala Flagship Store (KLA-01)</option>
              ) : (
                stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.code})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Assign to Physical Register</label>
            <select
              value={selectedRegisterId}
              onChange={e => setSelectedRegisterId(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 hover:border-slate-400 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 shadow-sm"
              required
            >
              {registers.length === 0 ? (
                <option value="reg-001-main">Register 01 (Main Counter)</option>
              ) : (
                registers.map(reg => (
                  <option key={reg.id} value={reg.id}>
                    {reg.register_name} ({reg.branch_name || 'Main Branch'})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5 text-slate-800 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Offline-First Terminal</span>
            </div>
            <p>1. Terminal links directly to the selected register.</p>
            <p>2. Sales and cash management operate offline without network reliance.</p>
            <p>3. Cloud synchronization runs automatically in the background when connected.</p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-98 text-white shadow-lg shadow-amber-500/25 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isSubmitting ? 'Pairing Terminal...' : 'Pair Terminal & Proceed'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
