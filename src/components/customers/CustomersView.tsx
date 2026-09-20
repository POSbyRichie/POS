import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Award,
  Plus,
  Search,
  Phone,
  Mail,
  X,
  Sparkles,
} from 'lucide-react';
import { db, customerRepository, loyaltyRepository } from '../../db';
import { Customer, LoyaltyTransaction } from '../../types';
import { formatMoney } from '../../utils/money';
import { usePos } from '../../store/posStore';

export type CustomersActiveTab = 'customers' | 'loyalty';

export const CustomersView: React.FC = () => {
  const { currentUser } = usePos();

  const [activeTab, setActiveTab] = useState<CustomersActiveTab>('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loyaltyTransactions, setLoyaltyTransactions] = useState<LoyaltyTransaction[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [_isLoading, setIsLoading] = useState<boolean>(true);

  // New Customer Modal
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustEmail, setNewCustEmail] = useState<string>('');
  const [newCustNotes, setNewCustNotes] = useState<string>('');
  const [custFormError, setCustFormError] = useState<string | null>(null);

  // Adjust Points Modal
  const [isAdjustPointsOpen, setIsAdjustPointsOpen] = useState<boolean>(false);
  const [selectedCustForPoints, setSelectedCustForPoints] = useState<Customer | null>(null);
  const [pointsDeltaInput, setPointsDeltaInput] = useState<string>('50');
  const [pointsReason, setPointsReason] = useState<string>('Promotion bonus');
  const [pointsFeedback, setPointsFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [allCusts, allTx] = await Promise.all([
        customerRepository.getAll(),
        db.loyaltyTransactions.reverse().limit(100).toArray(),
      ]);
      setCustomers(allCusts);
      setLoyaltyTransactions(allTx);
    } catch (err) {
      console.error('Failed to load customers & loyalty:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Search filter
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      Boolean(c.phone && c.phone.includes(q)) ||
      Boolean(c.email && c.email.toLowerCase().includes(q)) ||
      Boolean(c.loyalty_number && c.loyalty_number.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  // Loyalty Metrics
  const loyaltyMetrics = useMemo(() => {
    const totalMembers = customers.length;
    const totalPoints = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);
    const earnedTx = loyaltyTransactions.filter(t => t.type === 'EARN').length;
    const redeemedTx = loyaltyTransactions.filter(t => t.type === 'REDEEM').length;
    return { totalMembers, totalPoints, earnedTx, redeemedTx };
  }, [customers, loyaltyTransactions]);

  // Handle Save New Customer
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustFormError(null);
    if (!newCustName.trim()) {
      setCustFormError('Customer name is required');
      return;
    }

    try {
      await customerRepository.createCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim() || undefined,
        email: newCustEmail.trim() || undefined,
        loyalty_points: 0,
        total_spent: 0,
        address: newCustNotes.trim() || undefined,
        sync_status: 'pending',
      });

      await loadData();
      setIsAddCustomerOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
      setNewCustNotes('');
    } catch (err: any) {
      setCustFormError(err.message || 'Error creating customer');
    }
  };

  // Handle Points Adjustment Submit
  const handleAdjustPointsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPointsFeedback(null);
    if (!selectedCustForPoints) return;
    const delta = parseInt(pointsDeltaInput, 10);
    if (isNaN(delta) || delta === 0) {
      setPointsFeedback('Points delta must be a non-zero integer');
      return;
    }

    try {
      await loyaltyRepository.recordTransaction({
        customerId: selectedCustForPoints.id,
        pointsDelta: delta,
        type: 'ADJUST',
        reason: pointsReason.trim() || 'Manual adjustment',
        cashierId: currentUser?.id,
      });

      await loadData();
      setIsAdjustPointsOpen(false);
      setSelectedCustForPoints(null);
    } catch (err: any) {
      setPointsFeedback(err.message || 'Error recording loyalty transaction');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            <span>CUSTOMERS &amp; LOYALTY REWARDS</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Customer Directory, Loyalty Points Accrual &amp; Immutable Audit Trail Ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddCustomerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-purple-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>New Customer</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('customers')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'customers'
              ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Customers ({customers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('loyalty')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
            activeTab === 'loyalty'
              ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Award className="w-3.5 h-3.5 text-amber-400" />
          <span>Loyalty Audit Trail ({loyaltyTransactions.length})</span>
        </button>
      </div>

      {/* TAB 1: CUSTOMERS DIRECTORY */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, email, or loyalty ID..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="grid grid-cols-12 gap-4 p-4 bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-4">Customer Details</div>
              <div className="col-span-3">Contact Info</div>
              <div className="col-span-2">Points Balance</div>
              <div className="col-span-2">Total Spent</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[550px] overflow-y-auto">
              {filteredCustomers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No customers found. Click &quot;New Customer&quot; above to register.
                </div>
              ) : (
                filteredCustomers.map(cust => (
                  <div
                    key={cust.id}
                    className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-800/30 transition text-xs"
                  >
                    <div className="col-span-4">
                      <span className="font-bold text-white text-sm block">{cust.name}</span>
                      <span className="font-mono text-[10px] text-slate-500 block">
                        ID: {cust.loyalty_number || cust.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="col-span-3 space-y-0.5 text-[11px] text-slate-400">
                      {cust.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{cust.phone}</span>
                        </div>
                      )}
                      {cust.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span className="truncate">{cust.email}</span>
                        </div>
                      )}
                      {!cust.phone && !cust.email && <span className="text-slate-600">No contact info</span>}
                    </div>

                    <div className="col-span-2">
                      <span className="px-2.5 py-1 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-bold text-xs inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>{cust.loyalty_points || 0} pts</span>
                      </span>
                    </div>

                    <div className="col-span-2 text-white font-mono font-semibold">
                      {formatMoney(cust.total_spent || 0)}
                    </div>

                    <div className="col-span-1 flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setSelectedCustForPoints(cust);
                          setPointsDeltaInput('50');
                          setPointsReason('Promotion reward');
                          setPointsFeedback(null);
                          setIsAdjustPointsOpen(true);
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-purple-600 hover:text-white text-purple-300 rounded-lg text-xs font-semibold transition border border-slate-700"
                        title="Adjust loyalty points"
                      >
                        Adjust
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOYALTY AUDIT TRAIL */}
      {activeTab === 'loyalty' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Total Loyalty Members</span>
              <span className="text-2xl font-black text-white mt-1 block">{loyaltyMetrics.totalMembers}</span>
              <span className="text-[11px] text-slate-500 mt-1 block">Active loyalty accounts</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Points in Circulation</span>
              <span className="text-2xl font-black text-purple-400 mt-1 block">
                {loyaltyMetrics.totalPoints.toLocaleString()} pts
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">Unredeemed balance</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Earn Events</span>
              <span className="text-2xl font-black text-emerald-400 mt-1 block">{loyaltyMetrics.earnedTx}</span>
              <span className="text-[11px] text-slate-500 mt-1 block">Points awarded from sales</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Redemptions</span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">{loyaltyMetrics.redeemedTx}</span>
              <span className="text-[11px] text-slate-500 mt-1 block">Rewards redeemed</span>
            </div>
          </div>

          {/* Immutable Transaction Ledger */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Immutable Loyalty Transaction Ledger</span>
              <span className="text-[10px] text-slate-500 font-mono">Showing {loyaltyTransactions.length} records</span>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
              {loyaltyTransactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No loyalty transactions recorded yet.
                </div>
              ) : (
                loyaltyTransactions.map(tx => {
                  const cust = customers.find(c => c.id === tx.customer_id);
                  const isPositive = tx.points_delta > 0;
                  return (
                    <div
                      key={tx.id}
                      className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                              tx.type === 'EARN'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : tx.type === 'REDEEM'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-purple-950 text-purple-400 border border-purple-800'
                            }`}
                          >
                            LOYALTY {tx.type}
                          </span>
                          <span className="font-bold text-white">
                            {cust ? cust.name : tx.customer_id.slice(0, 8)}
                          </span>
                          {tx.receipt_number && (
                            <span className="font-mono text-[10px] text-sky-400">
                              Sale #{tx.receipt_number}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-400 mt-1 block">
                          Reason: {tx.reason || 'Loyalty activity'} &bull; Balance: {tx.previous_points} &rarr;{' '}
                          {tx.new_points} pts
                        </span>
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-sm font-black font-mono ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? `+${tx.points_delta}` : tx.points_delta} pts
                        </span>
                        <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                          {new Date(tx.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD CUSTOMER */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-400" />
                <span>Add New Customer</span>
              </h3>
              <button onClick={() => setIsAddCustomerOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {custFormError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {custFormError}
              </div>
            )}

            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={newCustPhone}
                  onChange={e => setNewCustPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 019-2831"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newCustEmail}
                  onChange={e => setNewCustEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Preferences</label>
                <input
                  type="text"
                  value={newCustNotes}
                  onChange={e => setNewCustNotes(e.target.value)}
                  placeholder="e.g. VIP client, preferred discount"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-600/30"
                >
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADJUST POINTS */}
      {isAdjustPointsOpen && selectedCustForPoints && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Adjust Points: {selectedCustForPoints.name}</span>
              </h3>
              <button onClick={() => setIsAdjustPointsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pointsFeedback && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {pointsFeedback}
              </div>
            )}

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-400">Current Balance:</span>{' '}
              <span className="text-white font-bold font-mono">{selectedCustForPoints.loyalty_points || 0} pts</span>
            </div>

            <form onSubmit={handleAdjustPointsSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Points Delta (+ to add, - to deduct) *
                </label>
                <input
                  type="number"
                  value={pointsDeltaInput}
                  onChange={e => setPointsDeltaInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Audit Reason *</label>
                <input
                  type="text"
                  required
                  value={pointsReason}
                  onChange={e => setPointsReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustPointsOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-600/30"
                >
                  Commit Points
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
