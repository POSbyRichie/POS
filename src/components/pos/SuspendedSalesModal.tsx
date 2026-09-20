import React from 'react';
import { X, Clock, Play, Trash2, ShoppingCart, User } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { formatMoney } from '../../utils/money';

interface SuspendedSalesModalProps {
  onClose: () => void;
}

export const SuspendedSalesModal: React.FC<SuspendedSalesModalProps> = ({ onClose }) => {
  const { suspendedSales, restoreSuspendedSale, removeSuspendedSale } = usePos();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Suspended Sales ({suspendedSales.length})</h3>
              <p className="text-xs text-slate-400">Parked transactions ready to be resumed</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sales List */}
        <div className="p-6 overflow-y-auto space-y-3 divide-y divide-slate-800/60">
          {suspendedSales.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Clock className="w-12 h-12 mx-auto mb-3 text-slate-600 opacity-50" />
              <p className="text-sm font-bold text-slate-300">No suspended sales</p>
              <p className="text-xs text-slate-500 mt-1">
                Use the &ldquo;Suspend Sales&rdquo; button in the cart to park active transactions.
              </p>
            </div>
          ) : (
            suspendedSales.map((sale, index) => {
              const totalAmount = sale.cartItems.reduce((acc, item) => acc + item.item_total, 0);
              const itemCount = sale.cartItems.reduce((acc, item) => acc + item.quantity, 0);
              const timeStr = new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={sale.id} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                        #{index + 1}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">{timeStr}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-200">
                      <span className="flex items-center gap-1 font-semibold">
                        <User className="w-3.5 h-3.5 text-purple-400" />
                        {sale.customer ? sale.customer.name : 'Walk-in Customer'}
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {itemCount} item{itemCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-emerald-400 font-mono">
                      {formatMoney(totalAmount)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        restoreSuspendedSale(sale.id);
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume Sale</span>
                    </button>
                    <button
                      onClick={() => removeSuspendedSale(sale.id)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition"
                      title="Discard parked sale"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
