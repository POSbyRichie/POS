import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Users,
  Key,
  Terminal,
  Smartphone,
  Settings as SettingsIcon,
  Plus,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FileText,
  Cloud,
  Database,
  Check,
  X,
} from 'lucide-react';
import { db } from '../../db';
import { User, Register, Device, Store, UserRole } from '../../types';
import { env } from '../../config/env';
import { testSupabaseConnection } from '../../services/supabase';
import { logger } from '../../utils/logger';
import { deviceService } from '../../services/deviceService';
import { generateUUID, hashPin } from '../../utils/id';
import { DeviceEnrollmentModal } from '../auth/DeviceEnrollmentModal';

export type AdminActiveTab = 'users' | 'roles' | 'registers' | 'devices' | 'settings';

export const AdministrationView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminActiveTab>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);

  // Modals state
  const [isAddUserOpen, setIsAddUserOpen] = useState<boolean>(false);
  const [isAddRegisterOpen, setIsAddRegisterOpen] = useState<boolean>(false);
  const [isEnrollDeviceOpen, setIsEnrollDeviceOpen] = useState<boolean>(false);

  // New User Form State
  const [newFullName, setNewFullName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>('cashier');
  const [newPin, setNewPin] = useState<string>('1234');
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // New Register Form State
  const [newRegName, setNewRegName] = useState<string>('');
  const [newRegCode, setNewRegCode] = useState<string>('');
  const [regFormError, setRegFormError] = useState<string | null>(null);

  // Settings state
  const [supabaseTestStatus, setSupabaseTestStatus] = useState<string | null>(null);
  const [isTestingCloud, setIsTestingCloud] = useState<boolean>(false);

  const loadAdminData = useCallback(async () => {
    try {
      const [allUsers, allRegs, allStores, status] = await Promise.all([
        db.users.toArray(),
        db.registers.toArray(),
        db.stores.toArray(),
        deviceService.getDeviceStatus(),
      ]);
      setUsers(allUsers);
      setRegisters(allRegs);
      setStores(allStores);
      setCurrentDevice(status.device);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    if (!newFullName.trim() || !newUsername.trim()) {
      setUserFormError('Full name and username are required');
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      setUserFormError('PIN must be 4 to 6 digits');
      return;
    }

    try {
      const existing = await db.users.where('username').equalsIgnoreCase(newUsername.trim()).first();
      if (existing) {
        setUserFormError(`Username "${newUsername.trim()}" already exists.`);
        return;
      }

      const salt = generateUUID().slice(0, 16);
      const pinHash = await hashPin(newPin, salt);
      const now = new Date().toISOString();
      const userId = generateUUID();

      const user: User = {
        id: userId,
        username: newUsername.trim().toLowerCase(),
        full_name: newFullName.trim(),
        role: newRole,
        pin_hash: pinHash,
        salt,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      await db.users.put(user);
      await loadAdminData();
      setIsAddUserOpen(false);
      setNewFullName('');
      setNewUsername('');
      setNewPin('1234');
    } catch (err: any) {
      setUserFormError(err.message || 'Error creating user');
    }
  };

  // Handle Create Register
  const handleCreateRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegFormError(null);
    if (!newRegName.trim() || !newRegCode.trim()) {
      setRegFormError('Name and code are required');
      return;
    }

    try {
      const regId = generateUUID();
      const register: Register = {
        id: regId,
        register_name: newRegName.trim(),
        branch_name: newRegCode.trim().toUpperCase(),
        is_active: true,
      };

      await db.registers.put(register);
      await loadAdminData();
      setIsAddRegisterOpen(false);
      setNewRegName('');
      setNewRegCode('');
    } catch (err: any) {
      setRegFormError(err.message || 'Error creating register');
    }
  };

  // Handle Cloud Test
  const handleTestCloud = async () => {
    setIsTestingCloud(true);
    setSupabaseTestStatus(null);
    const result = await testSupabaseConnection();
    setSupabaseTestStatus(result.message);
    setIsTestingCloud(false);
  };

  // Handle Diagnostics Export
  const handleExportDiagnostics = () => {
    const json = logger.exportLogsAsJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos-diagnostics-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-sky-400" />
            <span>ADMINISTRATION &amp; SYSTEM CONFIGURATION</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Users, Roles, Registers, Hardware Devices &amp; Store Environment Settings
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'users' && (
            <button
              onClick={() => setIsAddUserOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add User</span>
            </button>
          )}
          {activeTab === 'registers' && (
            <button
              onClick={() => setIsAddRegisterOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Register</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'users'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Users ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'roles'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Key className="w-3.5 h-3.5 text-amber-400" />
          <span>Roles &amp; Permissions</span>
        </button>

        <button
          onClick={() => setActiveTab('registers')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'registers'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Registers ({registers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('devices')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'devices'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-purple-400" />
          <span>Devices</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="grid grid-cols-12 gap-4 p-4 bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-4">User Details</div>
            <div className="col-span-3">Role &amp; Permissions</div>
            <div className="col-span-3">Status</div>
            <div className="col-span-2 text-right">Created</div>
          </div>

          <div className="divide-y divide-slate-800/80">
            {users.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No staff users registered yet. Click &quot;Add User&quot; above to create team member accounts.
              </div>
            ) : (
              users.map(u => (
              <div key={u.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-800/30 transition text-xs">
                <div className="col-span-4">
                  <span className="font-bold text-white text-sm block">{u.full_name}</span>
                  <span className="font-mono text-[11px] text-slate-400">@{u.username}</span>
                </div>

                <div className="col-span-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase font-mono border ${
                      u.role === 'admin'
                        ? 'bg-purple-950 text-purple-300 border-purple-800'
                        : u.role === 'manager'
                        ? 'bg-sky-950 text-sky-300 border-sky-800'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {u.role}
                  </span>
                </div>

                <div className="col-span-3 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="text-slate-300 font-semibold">{u.is_active ? 'Active' : 'Disabled'}</span>
                </div>

                <div className="col-span-2 text-right text-slate-500 font-mono text-[11px]">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* TAB 2: ROLES */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-bold text-xs">
                ADMIN
              </span>
              <h3 className="font-bold text-white text-sm">Full System Control</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Unrestricted access to all subsystem operations, user administration, database schema, role changes, and system settings.
            </p>
            <ul className="text-xs text-slate-300 space-y-2 border-t border-slate-800 pt-3">
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                User and Register Management
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Store &amp; Sync Diagnostics
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Price Overrides &amp; Full Refunds
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Shift Reconciliation Auditing
              </li>
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-sky-950 text-sky-300 border border-sky-800 font-bold text-xs">
                MANAGER
              </span>
              <h3 className="font-bold text-white text-sm">Operations Manager</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Daily floor operations oversight, shift drawer approvals, stock inventory movements, and sales performance reports.
            </p>
            <ul className="text-xs text-slate-300 space-y-2 border-t border-slate-800 pt-3">
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Shift Open, Close &amp; Drops
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Inventory Adjustments &amp; Restock
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Line &amp; Cart Discounts
              </li>
              <li className="flex items-center gap-2 text-slate-500 font-medium">
                <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                User Account Provisioning
              </li>
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold text-xs">
                CASHIER
              </span>
              <h3 className="font-bold text-white text-sm">POS Operator</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              High-speed checkout operations, barcode scanning, cart processing, receipt generation, and customer loyalty attachment.
            </p>
            <ul className="text-xs text-slate-300 space-y-2 border-t border-slate-800 pt-3">
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                New Sale &amp; Barcode Scanning
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Cash, Card &amp; Mobile Payments
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Receipt Print &amp; Reprints
              </li>
              <li className="flex items-center gap-2 text-slate-500 font-medium">
                <X className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                Manual Stock Decrements
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 3: REGISTERS */}
      {activeTab === 'registers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="grid grid-cols-12 gap-4 p-4 bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-4">Register Name</div>
            <div className="col-span-3">Branch / Location</div>
            <div className="col-span-3">Store</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          <div className="divide-y divide-slate-800/80">
            {registers.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No registers configured yet. Click &quot;Add Register&quot; above to provision a register.
              </div>
            ) : (
              registers.map(reg => (
              <div key={reg.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-800/30 transition text-xs">
                <div className="col-span-4">
                  <span className="font-bold text-white text-sm block">{reg.register_name}</span>
                  <span className="font-mono text-[10px] text-slate-500">ID: {reg.id.slice(0, 8)}</span>
                </div>
                <div className="col-span-3 font-mono font-bold text-sky-400">{reg.branch_name}</div>
                <div className="col-span-3 text-slate-300">{stores.length > 0 ? stores[0].name : 'Main Store'}</div>
                <div className="col-span-2 text-right">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                    {reg.is_active ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* TAB 4: DEVICES */}
      {activeTab === 'devices' && (
        <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-purple-400" />
                <span>Enrolled Hardware Terminal</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Cryptographically bound device fingerprint for secure offline caching and authorization.
              </p>
            </div>
            <button
              onClick={() => setIsEnrollDeviceOpen(true)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition"
            >
              Re-enroll Terminal
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between">
              <span className="text-slate-400">Device Name:</span>
              <span className="font-bold text-white">{currentDevice?.device_name || 'Counter Terminal 01'}</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between">
              <span className="text-slate-400">Hardware Fingerprint:</span>
              <span className="font-mono text-sky-400 text-[11px]">{deviceService.getFingerprint()}</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between">
              <span className="text-slate-400">Pairing Status:</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Enrolled &amp; Trusted
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Supabase Cloud Status Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
              <Cloud className="w-4 h-4" />
              <span>Supabase Cloud Integration</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">Configured:</span>
                <span className={`font-bold font-mono ${env.isSupabaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {env.isSupabaseConfigured ? 'Connected' : 'Local Storage Mode'}
                </span>
              </div>

              <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">URL:</span>
                <span className="font-mono text-slate-300 truncate max-w-[180px]">
                  {env.supabaseUrl || 'Local Storage Mode'}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={isTestingCloud}
              onClick={handleTestCloud}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingCloud ? 'animate-spin' : ''}`} />
              Test Cloud Connection
            </button>

            {supabaseTestStatus && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs flex items-start gap-2 text-slate-300">
                {supabaseTestStatus.includes('Connected') ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{supabaseTestStatus}</span>
              </div>
            )}
          </div>

          {/* Diagnostics Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Database className="w-4 h-4" />
              <span>Local Storage &amp; Diagnostics</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">Primary Database:</span>
                <span className="font-bold text-slate-200 font-mono">Local Transaction Database</span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">Offline Resilience:</span>
                <span className="font-bold text-emerald-400 font-mono">Active &amp; Protected</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportDiagnostics}
              className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-sky-600/30"
            >
              <FileText className="w-3.5 h-3.5" />
              Export System Diagnostic Logs
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ADD USER */}
      {isAddUserOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Create System User</h3>
            {userFormError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {userFormError}
              </div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Role *</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Security PIN (4-6 digits) *</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs"
                >
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD REGISTER */}
      {isAddRegisterOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Create New Register</h3>
            {regFormError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {regFormError}
              </div>
            )}
            <form onSubmit={handleCreateRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Register Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Counter 02"
                  value={newRegName}
                  onChange={e => setNewRegName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Register Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., REG-02"
                  value={newRegCode}
                  onChange={e => setNewRegCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono uppercase"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddRegisterOpen(false)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs"
                >
                  Save Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENROLL DEVICE */}
      {isEnrollDeviceOpen && (
        <DeviceEnrollmentModal
          onEnrolled={() => {
            setIsEnrollDeviceOpen(false);
            loadAdminData();
          }}
        />
      )}
    </div>
  );
};
