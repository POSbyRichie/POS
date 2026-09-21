import React, { useState } from 'react';
import {
  Building2,
  User,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { db } from '../../db';
import { User as PosUser, Store, Register } from '../../types';
import { generateUUID, generateSalt, hashPin } from '../../utils/id';
import { deviceService } from '../../services/deviceService';
import { authService } from '../../services/authService';
import { usePos } from '../../store/posStore';
import { useRouter } from '../../routes/router';

interface InitialSetupModalProps {
  onComplete: (adminUser: PosUser) => void;
}

export const InitialSetupModal: React.FC<InitialSetupModalProps> = ({ onComplete }) => {
  const { setCurrentUser, setActiveRegister, setActiveDevice, setActiveView } = usePos();
  const { navigate } = useRouter();

  // Step state: 1 = Business Details, 2 = Admin Account
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Business Profile
  const [storeName, setStoreName] = useState<string>('');
  const [storeCode, setStoreCode] = useState<string>('STORE-01');
  const [currencySymbol, setCurrencySymbol] = useState<string>('UGX');
  const [storeAddress, setStoreAddress] = useState<string>('');
  const [storePhone, setStorePhone] = useState<string>('');
  const [registerName, setRegisterName] = useState<string>('Register 01 (Main Counter)');

  // Administrator Account
  const [adminFullName, setAdminFullName] = useState<string>('');
  const [adminUsername, setAdminUsername] = useState<string>('admin');
  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);

  // Status
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!storeName.trim()) {
      setError('Please enter your business or store name.');
      return;
    }
    if (!currencySymbol.trim()) {
      setError('Please enter your currency symbol (e.g. UGX, $, ₦, KSh).');
      return;
    }
    if (!registerName.trim()) {
      setError('Please provide a name for this checkout register station.');
      return;
    }

    setCurrentStep(2);
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!adminFullName.trim()) {
      setError('Please enter your administrator full name.');
      return;
    }
    if (!adminUsername.trim() || adminUsername.trim().length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Security PIN must be 4 to 6 numeric digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create Store Profile
      const storeId = generateUUID();
      const newStore: Store = {
        id: storeId,
        name: storeName.trim(),
        code: storeCode.trim() || 'STORE-01',
        tagline: 'Smart POS • Growing Businesses',
        address: storeAddress.trim() || 'Primary Store Location',
        phone: storePhone.trim() || '+256 700 000000',
        email: 'admin@pos.local',
        tax_id: 'TAX-001',
        currency_code: currencySymbol.trim(),
        currency_symbol: currencySymbol.trim(),
        currency_decimals: 0,
        loyalty_rate: 100,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.stores.put(newStore);

      // 2. Create Register Station
      const registerId = 'reg-001-main';
      const newRegister: Register = {
        id: registerId,
        store_id: storeId,
        register_name: registerName.trim() || 'Register 01 (Main Counter)',
        branch_name: storeName.trim(),
        is_active: true,
      };
      await db.registers.put(newRegister);

      // 3. Enroll Workstation Terminal
      const enrolledDevice = await deviceService.enrollDevice({
        deviceId: 'dev-pos-terminal-01',
        registerId: registerId,
        deviceName: `${registerName.trim()} Terminal`,
        storeId: storeId,
      });

      // 4. Securely Hash Admin PIN
      const salt = generateSalt();
      const pinHash = await hashPin(pin, salt);

      // 5. Create Administrator Account
      const adminId = generateUUID();
      const newAdminUser: PosUser = {
        id: adminId,
        username: adminUsername.trim().toLowerCase(),
        full_name: adminFullName.trim(),
        role: 'admin',
        pin_hash: pinHash,
        salt: salt,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.users.put(newAdminUser);

      // 6. Cache for Offline Authentication
      await authService.cacheUserForOffline(newAdminUser, enrolledDevice.id, registerId);

      // 7. Update Session State & Login
      setCurrentUser(newAdminUser);
      setActiveRegister(newRegister);
      setActiveDevice(enrolledDevice);
      setActiveView('dashboard');

      onComplete(newAdminUser);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Failed to complete initial system setup:', err);
      setError(err?.message || 'An unexpected error occurred during setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-white">RichiePOS Installation Setup</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                  FIRST RUN
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure your business profile and create your administrator credentials
              </p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-2 bg-slate-950/50 border-b border-slate-800 text-xs font-semibold">
          <div
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition ${
              currentStep === 1
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>1. Business &amp; Station</span>
          </div>
          <div
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition ${
              currentStep === 2
                ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                : 'border-transparent text-slate-400'
            }`}
          >
            <User className="w-4 h-4" />
            <span>2. Administrator Account</span>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="m-6 mb-0 p-3.5 bg-rose-950/80 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Business Profile */}
        {currentStep === 1 && (
          <form onSubmit={handleNextStep} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Business / Store Name *
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                placeholder="e.g. Darwin Supermarket &amp; Retail"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Store Code
                </label>
                <input
                  type="text"
                  value={storeCode}
                  onChange={e => setStoreCode(e.target.value)}
                  placeholder="e.g. STORE-01"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Currency (Default: UGX) *
                </label>
                <input
                  type="text"
                  required
                  value={currencySymbol}
                  onChange={e => setCurrencySymbol(e.target.value)}
                  placeholder="UGX (Ugandan Shillings)"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Primary Register Terminal Name *
              </label>
              <div className="relative">
                <Terminal className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={registerName}
                  onChange={e => setRegisterName(e.target.value)}
                  placeholder="e.g. Register 01 (Main Counter)"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Store Phone
                </label>
                <input
                  type="tel"
                  value={storePhone}
                  onChange={e => setStorePhone(e.target.value)}
                  placeholder="e.g. +256 700 123456"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Store Address
                </label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={e => setStoreAddress(e.target.value)}
                  placeholder="e.g. Plot 12 Central Avenue"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
              >
                <span>Continue to Admin Setup</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Administrator Account */}
        {currentStep === 2 && (
          <form onSubmit={handleCompleteSetup} className="p-6 space-y-4">
            <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl text-xs text-sky-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <span>
                This administrator account grants complete authority to manage inventory, oversee shifts, add cashier staff, and configure settings.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Administrator Full Name *
              </label>
              <input
                type="text"
                required
                value={adminFullName}
                onChange={e => setAdminFullName(e.target.value)}
                placeholder="e.g. Alex M. (Store Owner)"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Username *
              </label>
              <input
                type="text"
                required
                value={adminUsername}
                onChange={e => setAdminUsername(e.target.value.toLowerCase())}
                placeholder="e.g. admin"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Security PIN (4–6 Digits) *
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPin ? 'text' : 'password'}
                    required
                    maxLength={6}
                    pattern="[0-9]{4,6}"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 9999"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition font-mono tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm Security PIN *
                </label>
                <input
                  type={showPin ? 'text' : 'password'}
                  required
                  maxLength={6}
                  pattern="[0-9]{4,6}"
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Repeat PIN"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition font-mono tracking-widest"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 text-slate-400 hover:text-white text-xs font-semibold transition"
              >
                &larr; Back
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Initializing System...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Complete Setup &amp; Enter POS</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
