import React, { useState, useEffect } from 'react';
import { Terminal, ShieldCheck, AlertTriangle, CheckCircle, Wifi, WifiOff } from 'lucide-react';
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
    const [allStores, allRegisters] = await Promise.all([
      db.stores.toArray(),
      db.registers.where('is_active').equals(1).toArray(),
    ]);

    setStores(allStores);
    setRegisters(allRegisters);
    if (allStores.length > 0) {
      setSelectedStoreId(allStores[0].id);
    }
    if (allRegisters.length > 0) {
      setSelectedRegisterId(allRegisters[0].id);
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      setError('Cannot enroll device while offline. First setup must be performed while connected to the internet.');
      return;
    }

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-sky-950/80 to-slate-900 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
              <Terminal className="w-5 h-5 text-sky-400" />
              <span>TERMINAL HARDWARE ENROLLMENT</span>
            </div>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isOnline
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isOnline ? 'Online Ready' : 'Internet Required'}
            </span>
          </div>
          <h3 className="text-xl font-black text-white">First-Time POS Terminal Setup</h3>
          <p className="text-xs text-slate-400 mt-1">
            This hardware device must be verified and enrolled while online before offline sales can be processed.
          </p>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleEnrollSubmit} className="p-6 space-y-4">
          {!isOnline && (
            <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-bold block">Offline Setup Blocked</span>
                A cashier cannot magically enroll a terminal when the internet is down. Connect to the internet to complete device registration.
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl flex items-center gap-2 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Hardware Fingerprint ID</label>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-400">
              {fingerprint}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Terminal Name</label>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder="e.g. Counter POS iPad 01"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Target Store Branch</label>
            <select
              value={selectedStoreId}
              onChange={e => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
            >
              {stores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Assign to Physical Register</label>
            <select
              value={selectedRegisterId}
              onChange={e => setSelectedRegisterId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
              required
            >
              {registers.map(reg => (
                <option key={reg.id} value={reg.id}>
                  {reg.register_name} ({reg.branch_name || 'Main Branch'})
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Authoritative Offline Protocol</span>
            </div>
            <p>1. Enroll terminal online to authorize this hardware instance.</p>
            <p>2. Cashier logs in online to securely cache credentials.</p>
            <p>3. If internet disconnects, cashier continues working offline seamlessly.</p>
          </div>

          <button
            type="submit"
            disabled={!isOnline || isSubmitting}
            className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              isOnline && !isSubmitting
                ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/30 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isSubmitting ? 'Enrolling Hardware...' : 'Complete Online Enrollment & Authorize'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
