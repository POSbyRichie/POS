import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  CloudOff,
  RotateCcw,
  Printer,
} from 'lucide-react';
import { db } from '../../db';
import { Sale, SaleItem, Shift, Receipt } from '../../types';
import { formatMoney } from '../../utils/money';
import { receiptService } from '../../services/receiptService';
import { ReprintModal } from '../pos/ReprintModal';
import { NotificationQueuesView } from './NotificationQueuesView';

export const ReportsView: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeReportTab, setActiveReportTab] = useState<
    'sales' | 'payment_methods' | 'cashier' | 'products' | 'shifts' | 'offline_sync' | 'queues'
  >('sales');

  const [isReprintModalOpen, setIsReprintModalOpen] = useState<boolean>(false);
  const [selectedReceiptForReprint, setSelectedReceiptForReprint] = useState<Receipt | null>(null);

  useEffect(() => {
    loadReportData();
  }, []);

  const loadReportData = async () => {
    const [allSales, allItems, allShifts] = await Promise.all([
      db.sales.toArray(),
      db.saleItems.toArray(),
      db.shifts.toArray(),
    ]);

    setSales(allSales);
    setSaleItems(allItems);
    setShifts(allShifts);
  };

  const handleOpenReprintForSale = async (sale: Sale) => {
    try {
      const receipt = await receiptService.getReceiptBySaleId(sale.id);
      setSelectedReceiptForReprint(receipt);
      setIsReprintModalOpen(true);
    } catch (err) {
      console.error('Error fetching receipt for reprint:', err);
    }
  };

  const handleOpenGeneralReprintCenter = () => {
    setSelectedReceiptForReprint(null);
    setIsReprintModalOpen(true);
  };

  // Metrics computation
  const totalGrossSales = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalDiscounts = sales.reduce((sum, s) => sum + s.discount_amount, 0);
  const totalTax = sales.reduce((sum, s) => sum + s.tax_amount, 0);
  const completedSalesCount = sales.filter(s => s.payment_status === 'paid').length;
  const pendingSyncSales = sales.filter(s => s.sync_status !== 'synced');

  // Sales by payment method
  const cashSales = sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + s.total_amount, 0);
  const cardSales = sales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + s.total_amount, 0);
  const walletSales = sales.filter(s => s.payment_method === 'wallet').reduce((sum, s) => sum + s.total_amount, 0);
  const qrSales = sales.filter(s => s.payment_method === 'qr').reduce((sum, s) => sum + s.total_amount, 0);
  const splitSales = sales.filter(s => s.payment_method === 'split').reduce((sum, s) => sum + s.total_amount, 0);

  // Sales by product aggregation
  const productSalesMap: { [prodId: string]: { name: string; sku: string; qty: number; total: number } } = {};
  for (const item of saleItems) {
    if (!productSalesMap[item.product_id]) {
      productSalesMap[item.product_id] = {
        name: item.product_name,
        sku: item.sku,
        qty: 0,
        total: 0,
      };
    }
    productSalesMap[item.product_id].qty += item.quantity;
    productSalesMap[item.product_id].total += item.total_price;
  }
  const topProducts = Object.values(productSalesMap).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <span>14. SALES &amp; RECONCILIATION REPORTS</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Local real-time financial telemetry &bull; Automatically reconciles with Supabase on sync
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleOpenGeneralReprintCenter}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reprint Center</span>
          </button>

          {[
            { id: 'sales', label: 'Summary' },
            { id: 'payment_methods', label: 'Payment Methods' },
            { id: 'products', label: 'By Product' },
            { id: 'shifts', label: 'Shift History' },
            { id: 'queues', label: 'Email / SMS Queues' },
            { id: 'offline_sync', label: `Offline Sync (${pendingSyncSales.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border ${
                activeReportTab === tab.id
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">Gross Sales Recorded</span>
          <p className="text-2xl font-bold text-white font-mono mt-1">{formatMoney(totalGrossSales)}</p>
          <span className="text-[11px] text-slate-400 mt-2 block">{completedSalesCount} completed sales</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">Total Discounts Given</span>
          <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">{formatMoney(totalDiscounts)}</p>
          <span className="text-[11px] text-slate-400 mt-2 block">Line item &amp; cart discounts</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">VAT / Taxes Collected</span>
          <p className="text-2xl font-bold text-sky-400 font-mono mt-1">{formatMoney(totalTax)}</p>
          <span className="text-[11px] text-slate-400 mt-2 block">18% Standard rate breakdown</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">Pending Sync to Cloud</span>
          <p className="text-2xl font-bold text-amber-400 font-mono mt-1">{pendingSyncSales.length}</p>
          <span className="text-[11px] text-slate-400 mt-2 block">Saved locally in IndexedDB</span>
        </div>
      </div>

      {/* Tab 1: Sales Ledger */}
      {activeReportTab === 'sales' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Receipt #</span>
            <span>Date &amp; Time</span>
            <span>Items</span>
            <span>Payment</span>
            <span>Total</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
            {sales.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No sales completed yet.</div>
            ) : (
              sales.map(sale => (
                <div key={sale.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs hover:bg-slate-900/60 transition">
                  <span className="font-mono font-bold text-sky-400">{sale.receipt_number}</span>
                  <span className="text-slate-400">{new Date(sale.created_at).toLocaleString()}</span>
                  <span className="text-slate-300 font-mono">{sale.items_count} items</span>
                  <span className="uppercase text-[11px] font-bold text-slate-300">{sale.payment_method}</span>
                  <span className="font-mono font-bold text-white">{formatMoney(sale.total_amount)}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      sale.sync_status === 'synced'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {sale.sync_status === 'synced' ? 'Synced' : 'Offline Pending'}
                  </span>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenReprintForSale(sale)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded-lg text-[11px] font-bold flex items-center gap-1 border border-slate-700 transition"
                      title="View & Reprint Receipt"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Receipt</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Payment Methods Breakdown */}
      {activeReportTab === 'payment_methods' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold text-emerald-400 uppercase">Cash Payments</span>
            <p className="text-xl font-bold text-white font-mono mt-1">{formatMoney(cashSales)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold text-sky-400 uppercase">Card Payments</span>
            <p className="text-xl font-bold text-white font-mono mt-1">{formatMoney(cardSales)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold text-purple-400 uppercase">Wallet / MM</span>
            <p className="text-xl font-bold text-white font-mono mt-1">{formatMoney(walletSales)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold text-amber-400 uppercase">QR Payments</span>
            <p className="text-xl font-bold text-white font-mono mt-1">{formatMoney(qrSales)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <span className="text-xs font-bold text-indigo-400 uppercase">Split Payments</span>
            <p className="text-xl font-bold text-white font-mono mt-1">{formatMoney(splitSales)}</p>
          </div>
        </div>
      )}

      {/* Tab 3: Sales by Product */}
      {activeReportTab === 'products' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Product Name</span>
            <span>SKU</span>
            <span>Units Sold</span>
            <span className="text-right">Revenue Generated</span>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
            {topProducts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No product sales recorded yet.</div>
            ) : (
              topProducts.map(prod => (
                <div key={prod.sku} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{prod.name}</span>
                  <span className="font-mono text-slate-400">{prod.sku}</span>
                  <span className="font-mono text-slate-200">{prod.qty} units</span>
                  <span className="font-mono font-bold text-emerald-400 text-right">{formatMoney(prod.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Shift History */}
      {activeReportTab === 'shifts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Shift ID</span>
            <span>Opened</span>
            <span>Status</span>
            <span>Total Sales</span>
            <span>Variance</span>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
            {shifts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No shifts recorded.</div>
            ) : (
              shifts.map(shift => (
                <div key={shift.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-sky-400">{shift.id.slice(0, 12)}...</span>
                  <span className="text-slate-400">{new Date(shift.opened_at).toLocaleString()}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      shift.status === 'open'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {shift.status}
                  </span>
                  <span className="font-mono font-bold text-white">{formatMoney(shift.total_sales)}</span>
                  <span
                    className={`font-mono font-bold ${
                      (shift.variance || 0) < 0
                        ? 'text-rose-400'
                        : (shift.variance || 0) > 0
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {shift.variance !== undefined ? formatMoney(shift.variance) : 'N/A'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Notification Queues */}
      {activeReportTab === 'queues' && <NotificationQueuesView />}

      {/* Tab 6: Offline Resilience & Sync Telemetry */}
      {activeReportTab === 'offline_sync' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <CloudOff className="w-6 h-6 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Offline Resilience Telemetry</h3>
              <p className="text-xs text-slate-400">
                {pendingSyncSales.length} transaction(s) pending cloud upload
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            All offline sales are stored locally in IndexedDB with cryptographic idempotency keys. Upon reconnecting, they sync safely to Supabase without duplicate danger.
          </p>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden mt-3">
            {pendingSyncSales.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                All completed sales have synchronized to the server.
              </div>
            ) : (
              pendingSyncSales.map(s => (
                <div key={s.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-white block">{s.receipt_number}</span>
                    <span className="text-[10px] text-slate-500 font-mono">Key: {s.idempotency_key}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-400 block">{formatMoney(s.total_amount)}</span>
                    <span className="text-[10px] text-amber-400 font-bold">QUEUED FOR CLOUD SYNC</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Reprint Modal */}
      {isReprintModalOpen && (
        <ReprintModal
          initialReceipt={selectedReceiptForReprint}
          onClose={() => {
            setIsReprintModalOpen(false);
            setSelectedReceiptForReprint(null);
            loadReportData();
          }}
        />
      )}
    </div>
  );
};
