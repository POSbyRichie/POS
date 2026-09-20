import React, { useState } from 'react';
import { X, CreditCard, Gift, User, Check } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { customerRepository } from '../../db';

interface IssueLoyaltyCardModalProps {
  onClose: () => void;
}

export const IssueLoyaltyCardModal: React.FC<IssueLoyaltyCardModalProps> = ({ onClose }) => {
  const { selectedCustomer, selectCustomer } = usePos();

  const [customerName, setCustomerName] = useState<string>(selectedCustomer?.name || '');
  const [customerPhone, setCustomerPhone] = useState<string>(selectedCustomer?.phone || '');
  const [cardNumber, setCardNumber] = useState<string>(
    selectedCustomer?.loyalty_number || `LOYAL-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [starterPoints, setStarterPoints] = useState<number>(50);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    if (selectedCustomer) {
      // Update existing customer with loyalty card
      await customerRepository.update(selectedCustomer.id, {
        loyalty_number: cardNumber.trim(),
        loyalty_points: (selectedCustomer.loyalty_points || 0) + starterPoints,
      });
      const updatedCust = await customerRepository.get(selectedCustomer.id);
      if (updatedCust) {
        selectCustomer(updatedCust);
      }
    } else {
      // Create new customer with loyalty card
      const newCust = await customerRepository.createCustomer({
        name: customerName.trim(),
        phone: customerPhone.trim() || undefined,
        loyalty_number: cardNumber.trim(),
        loyalty_points: starterPoints,
        sync_status: 'pending',
      });
      selectCustomer(newCust);
    }

    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 font-bold">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Issue Loyalty Card</h3>
              <p className="text-xs text-slate-400">Reward points and barcode member card</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white">Loyalty Card Issued!</h4>
            <p className="text-xs text-slate-400 font-mono">Card #{cardNumber} &bull; +{starterPoints} Points credited</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Customer Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Sarah Kigozi"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Phone Number (Optional)</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="+256 700 000000"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Loyalty Card #</label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={e => setCardNumber(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Starter Bonus Points</label>
                <input
                  type="number"
                  min="0"
                  value={starterPoints}
                  onChange={e => setStarterPoints(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5"
              >
                <Gift className="w-3.5 h-3.5" />
                <span>Issue &amp; Assign</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
