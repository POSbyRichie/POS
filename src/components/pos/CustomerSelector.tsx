import React, { useState, useEffect } from 'react';
import { User, Search, PlusCircle, Award, Check, X } from 'lucide-react';
import { db } from '../../db';
import { Customer } from '../../types';
import { usePos } from '../../store/posStore';
import { generateUUID } from '../../utils/id';

interface CustomerSelectorProps {
  onClose: () => void;
}

export const CustomerSelector: React.FC<CustomerSelectorProps> = ({ onClose }) => {
  const { selectedCustomer, selectCustomer } = usePos();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  // New Customer Form State
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newAddress, setNewAddress] = useState<string>('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    const list = await db.customers.toArray();
    setCustomers(list);
  };

  const handleSelectWalkIn = () => {
    selectCustomer(null);
    onClose();
  };

  const handleSelectCustomer = (customer: Customer) => {
    selectCustomer(customer);
    onClose();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newCustId = generateUUID();
    const loyaltyNumber = `LOYAL-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const newCustomer: Customer = {
      id: newCustId,
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      email: newEmail.trim() || undefined,
      address: newAddress.trim() || undefined,
      loyalty_number: loyaltyNumber,
      loyalty_points: 0,
      sync_status: 'pending',
      created_at: now,
      updated_at: now,
    };

    await db.customers.put(newCustomer);

    // Add to sync queue
    await db.syncQueue.add({
      entity_type: 'customer',
      entity_id: newCustomer.id,
      operation: 'INSERT',
      payload: JSON.stringify(newCustomer),
      idempotency_key: `customer-${newCustomer.id}`,
      attempts: 0,
      max_attempts: 10,
      status: 'pending',
      created_at: now,
    });

    selectCustomer(newCustomer);
    await loadCustomers();
    setIsAddingNew(false);
    onClose();
  };

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.loyalty_number && c.loyalty_number.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="p-5 bg-gradient-to-r from-sky-950/80 to-slate-900 border-b border-slate-800 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
              <User className="w-5 h-5" />
              <span>9. CUSTOMER SELECTION &amp; LOYALTY</span>
            </div>
            <p className="text-xs text-slate-400">Search existing customer or create new member offline</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Walk-in Customer Default Button */}
          <button
            onClick={handleSelectWalkIn}
            className={`w-full p-3 rounded-xl border flex items-center justify-between transition ${
              selectedCustomer === null
                ? 'bg-sky-950/70 border-sky-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 font-bold">
                W
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-slate-200">Walk-in Customer (Standard)</span>
                <span className="text-[10px] text-slate-500">No loyalty points will be accrued</span>
              </div>
            </div>
            {selectedCustomer === null && <Check className="w-4 h-4 text-sky-400" />}
          </button>

          {!isAddingNew ? (
            <>
              {/* Search Bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by customer name, phone, or loyalty ID..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  onClick={() => setIsAddingNew(true)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 transition"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add Customer
                </button>
              </div>

              {/* Customer List */}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/60">
                {filteredCustomers.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    No customers found matching &ldquo;{searchQuery}&rdquo;.
                  </div>
                ) : (
                  filteredCustomers.map(cust => (
                    <button
                      key={cust.id}
                      onClick={() => handleSelectCustomer(cust)}
                      className={`w-full p-2.5 pt-3 rounded-xl border text-left flex items-center justify-between transition ${
                        selectedCustomer?.id === cust.id
                          ? 'bg-sky-950/70 border-sky-500 text-white'
                          : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold block text-slate-200">{cust.name}</span>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5 font-mono">
                          {cust.phone && <span>{cust.phone}</span>}
                          {cust.loyalty_number && <span>ID: {cust.loyalty_number}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                          <Award className="w-3 h-3 text-amber-400" />
                          {cust.loyalty_points || 0} pts
                        </span>
                        {selectedCustomer?.id === cust.id && <Check className="w-4 h-4 text-sky-400" />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            /* Add New Customer Form (Step 9: Add New Customer Offline) */
            <form onSubmit={handleCreateCustomer} className="space-y-3 pt-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-emerald-400">Create New Customer (Offline-Ready)</span>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="text-slate-400 text-xs hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Full Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. John Bosco"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="+256 700 000 000"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  placeholder="Kampala, Uganda"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30"
              >
                Save &amp; Select Customer
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
