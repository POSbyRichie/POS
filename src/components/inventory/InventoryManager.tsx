import React, { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import { db } from '../../db';
import { Product, InventoryMovement, InventoryMovementType } from '../../types';
import { inventoryService } from '../../services/inventoryService';
import { usePos } from '../../store/posStore';
import { formatMoney } from '../../utils/money';

export const InventoryManager: React.FC = () => {
  const { currentUser, activeRegister } = usePos();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'history' | 'adjust'>('catalog');

  // Adjustment form state
  const [adjType, setAdjType] = useState<InventoryMovementType>('RESTOCK');
  const [adjQty, setAdjQty] = useState<string>('10');
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [allProducts, allMovements] = await Promise.all([
      db.products.toArray(),
      db.inventoryMovements.reverse().limit(50).toArray(),
    ]);
    setProducts(allProducts);
    setMovements(allMovements);
  };

  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !activeRegister || !currentUser) return;

    const qty = parseInt(adjQty, 10);
    if (isNaN(qty) || qty === 0) return;

    // Determine signed delta
    let delta = qty;
    if (adjType === 'DAMAGE' || adjType === 'SALE') {
      delta = -Math.abs(qty);
    } else {
      delta = Math.abs(qty);
    }

    setIsSubmitting(true);
    try {
      await inventoryService.adjustStock(
        selectedProduct.id,
        delta,
        adjType,
        activeRegister.id,
        currentUser.id,
        adjNotes
      );
      await loadData();
      setActiveTab('catalog');
      setSelectedProduct(null);
      setAdjNotes('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex justify-between items-center shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-400" />
            <span>INVENTORY &amp; STOCK MANAGEMENT</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time stock ledger, immutable movements &bull; Logged in as{' '}
            <span className="text-sky-300 font-semibold">{currentUser?.full_name}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              activeTab === 'catalog'
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Product Catalog
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              activeTab === 'history'
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Movement History ({movements.length})
          </button>
        </div>
      </div>

      {activeTab === 'catalog' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Product</span>
            <span>SKU &amp; Barcode</span>
            <span>Cost &amp; Selling</span>
            <span>Available Stock</span>
            <span>Action</span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {products.map(prod => (
              <div
                key={prod.id}
                className="p-4 bg-slate-900/40 hover:bg-slate-850 flex items-center justify-between text-xs transition"
              >
                <div className="w-1/4">
                  <span className="font-bold text-slate-200 block text-sm">{prod.name}</span>
                  <span className="text-[11px] text-slate-500">{prod.unit}</span>
                </div>

                <div className="w-1/5 font-mono text-[11px] text-slate-400">
                  <span className="block">{prod.sku}</span>
                  <span className="text-slate-500">{prod.barcode}</span>
                </div>

                <div className="w-1/5">
                  <span className="text-white font-bold block">{formatMoney(prod.selling_price)}</span>
                  <span className="text-[10px] text-slate-500">Cost: {formatMoney(prod.cost_price)}</span>
                </div>

                <div className="w-1/5">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      prod.stock_quantity <= 0
                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                        : prod.stock_quantity <= prod.min_stock_level
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    }`}
                  >
                    {prod.stock_quantity} {prod.unit}
                  </span>
                </div>

                <div>
                  <button
                    onClick={() => {
                      setSelectedProduct(prod);
                      setActiveTab('adjust');
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-sky-600 hover:text-white text-sky-400 font-semibold rounded-xl text-xs transition border border-slate-700"
                  >
                    Adjust / Restock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'adjust' && selectedProduct && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg mx-auto shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">Stock Adjustment</h3>
              <p className="text-xs text-slate-400">{selectedProduct.name} ({selectedProduct.sku})</p>
            </div>
            <button
              onClick={() => setActiveTab('catalog')}
              className="text-slate-400 hover:text-white text-xs"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleExecuteAdjustment} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Adjustment Type *</label>
              <select
                value={adjType}
                onChange={e => setAdjType(e.target.value as InventoryMovementType)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              >
                <option value="RESTOCK">Stock In / Restock (+)</option>
                <option value="DAMAGE">Damaged Stock (-)</option>
                <option value="RETURN">Customer Return (+)</option>
                <option value="ADJUSTMENT">Stock Audit Adjustment (+/-)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Quantity ({selectedProduct.unit}) *</label>
              <input
                type="number"
                min="1"
                required
                value={adjQty}
                onChange={e => setAdjQty(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Reason / Notes</label>
              <input
                type="text"
                value={adjNotes}
                onChange={e => setAdjNotes(e.target.value)}
                placeholder="e.g. Delivery from Supplier PO-908"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30"
            >
              {isSubmitting ? 'Recording Movement...' : 'Save & Update Stock'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
            Immutable Inventory Movement Log (Audit Trail)
          </div>

          <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
            {movements.map(m => (
              <div key={m.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                        m.type === 'SALE'
                          ? 'bg-sky-950 text-sky-400'
                          : m.type === 'DAMAGE'
                          ? 'bg-rose-950 text-rose-400'
                          : 'bg-emerald-950 text-emerald-400'
                      }`}
                    >
                      {m.type}
                    </span>
                    <span className="font-bold text-slate-200">
                      Delta: {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Before: {m.previous_quantity} &rarr; After: {m.new_quantity} &bull; {m.notes}
                  </span>
                </div>

                <div className="text-right text-[10px] text-slate-500 font-mono">
                  <span>{new Date(m.timestamp).toLocaleString()}</span>
                  <span className="block text-slate-600">Key: {m.idempotency_key}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
