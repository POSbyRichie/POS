import React from 'react';
import { AlertOctagon, X, Search } from 'lucide-react';
import { usePos } from '../../store/posStore';

export const StockAlertModal: React.FC = () => {
  const { isStockAlertOpen, stockAlertMessage, setStockAlertOpen } = usePos();

  if (!isStockAlertOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 my-auto max-h-[92vh] flex flex-col">
        <div className="bg-rose-950/80 p-5 border-b border-rose-900/60 flex justify-between items-center">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <AlertOctagon className="w-5 h-5" />
            <span>Out of Stock</span>
          </div>
          <button
            onClick={() => setStockAlertOpen(false)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-rose-200">
            {stockAlertMessage}
          </div>

          <p className="text-xs text-slate-400">
            This item cannot be added to the cart because there is no remaining available stock in the inventory.
          </p>

          <div className="pt-2">
            <button
              onClick={() => setStockAlertOpen(false)}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
