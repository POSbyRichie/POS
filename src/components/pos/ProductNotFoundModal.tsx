import React, { useState } from 'react';
import { HelpCircle, Search, PlusCircle, X } from 'lucide-react';
import { usePos } from '../../store/posStore';
import { generateUUID } from '../../utils/id';
import { parseToMinorUnits } from '../../utils/money';
import { Product } from '../../types';

export const ProductNotFoundModal: React.FC = () => {
  const { isProductNotFoundOpen, searchedNotFoundTerm, setProductNotFoundOpen, addToCart } = usePos();
  const [isManualEntryMode, setIsManualEntryMode] = useState<boolean>(false);
  const [manualName, setManualName] = useState<string>('');
  const [manualPrice, setManualPrice] = useState<string>('');

  if (!isProductNotFoundOpen) return null;

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName || !manualPrice) return;

    const priceMinor = parseToMinorUnits(manualPrice, 0);

    const customProduct: Product = {
      id: generateUUID(),
      sku: `MANUAL-${Date.now().toString().slice(-4)}`,
      barcode: searchedNotFoundTerm || `MAN-${Date.now().toString().slice(-6)}`,
      name: manualName.trim(),
      category_id: 'cat-gro',
      cost_price: Math.round(priceMinor * 0.7),
      selling_price: priceMinor,
      tax_rate: 0,
      unit: 'item',
      stock_quantity: 999, // Custom ad-hoc line item
      min_stock_level: 0,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addToCart(customProduct, 1);
    setProductNotFoundOpen(false);
    setIsManualEntryMode(false);
    setManualName('');
    setManualPrice('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 my-auto max-h-[92vh] flex flex-col">
        <div className="bg-amber-950/70 p-5 border-b border-amber-900/60 flex justify-between items-center">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <HelpCircle className="w-5 h-5" />
            <span>PRODUCT FOUND DECISION: NO MATCH</span>
          </div>
          <button
            onClick={() => setProductNotFoundOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-slate-300">
              No product matched barcode or SKU:
            </p>
            <p className="text-sm font-mono font-bold text-amber-300 mt-1 bg-slate-950 p-2 rounded-lg border border-slate-800">
              &ldquo;{searchedNotFoundTerm}&rdquo;
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              According to the authoritative POS workflow, you may search again or perform an authorized manual entry. Active transaction session is safely preserved.
            </p>
          </div>

          {!isManualEntryMode ? (
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => setProductNotFoundOpen(false)}
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                SEARCH AGAIN
              </button>

              <button
                onClick={() => setIsManualEntryMode(true)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition border border-slate-700 flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                MANUAL ENTRY (AUTHORIZED STAFF)
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualAdd} className="space-y-3 pt-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Product Description / Name *
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Miscellaneous Grocery Item"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Selling Price (UGX) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={manualPrice}
                  onChange={e => setManualPrice(e.target.value)}
                  placeholder="5000"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 font-mono font-bold"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualEntryMode(false)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30"
                >
                  Add to Cart
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
