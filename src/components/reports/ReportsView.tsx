import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Calendar,
  Users,
  Package,
  CreditCard,
  Boxes,
  TrendingUp,
  Percent,
  Clock,
  Award,
  RotateCcw,
  Printer,
  ShieldAlert,
  RefreshCw,
  Search,
} from 'lucide-react';
import { db } from '../../db';
import { Sale, Receipt } from '../../types';
import { formatMoney } from '../../utils/money';
import { receiptService } from '../../services/receiptService';
import {
  reportService,
  DailySalesRow,
  CashierSalesRow,
  ProductSalesRow,
  PaymentMethodRow,
  InventoryReportData,
  ProfitReportData,
  DiscountsReportData,
  ShiftReportRow,
  LoyaltyReportData,
} from '../../services/reportService';
import { ReprintModal } from '../pos/ReprintModal';
import { NotificationQueuesView } from './NotificationQueuesView';
import { LoyaltyLedgerCard } from '../loyalty/LoyaltyLedgerCard';

type ReportTab =
  | 'daily'
  | 'cashier'
  | 'products'
  | 'payment_methods'
  | 'inventory'
  | 'profit'
  | 'discounts'
  | 'shifts'
  | 'loyalty'
  | 'queues'
  | 'offline_sync';

export const ReportsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Report states
  const [dailySales, setDailySales] = useState<DailySalesRow[]>([]);
  const [cashierSales, setCashierSales] = useState<CashierSalesRow[]>([]);
  const [productSales, setProductSales] = useState<ProductSalesRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [inventoryReport, setInventoryReport] = useState<InventoryReportData | null>(null);
  const [profitReport, setProfitReport] = useState<ProfitReportData | null>(null);
  const [discountsReport, setDiscountsReport] = useState<DiscountsReportData | null>(null);
  const [shiftsReport, setShiftsReport] = useState<ShiftReportRow[]>([]);
  const [loyaltyReport, setLoyaltyReport] = useState<LoyaltyReportData | null>(null);
  const [allSales, setAllSales] = useState<Sale[]>([]);

  // Modals
  const [isReprintModalOpen, setIsReprintModalOpen] = useState<boolean>(false);
  const [selectedReceiptForReprint, setSelectedReceiptForReprint] = useState<Receipt | null>(null);
  const [productSearch, setProductSearch] = useState<string>('');

  const loadAllReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      let start: string | undefined = undefined;
      if (dateRange === 'today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (dateRange === '7d') {
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateRange === '30d') {
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const [
        daily,
        cashier,
        products,
        payments,
        inventory,
        profit,
        discounts,
        shifts,
        loyalty,
        sales,
      ] = await Promise.all([
        reportService.getDailySalesReport(start),
        reportService.getCashierSalesReport(start),
        reportService.getProductSalesReport(start),
        reportService.getPaymentMethodsReport(start),
        reportService.getInventoryReport(),
        reportService.getProfitReport(start),
        reportService.getDiscountsReport(start),
        reportService.getShiftsReport(),
        reportService.getLoyaltyReport(),
        db.sales.toArray(),
      ]);

      setDailySales(daily);
      setCashierSales(cashier);
      setProductSales(products);
      setPaymentMethods(payments);
      setInventoryReport(inventory);
      setProfitReport(profit);
      setDiscountsReport(discounts);
      setShiftsReport(shifts);
      setLoyaltyReport(loyalty);
      setAllSales(sales);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadAllReports();
  }, [loadAllReports]);

  const handleOpenReprintForSale = async (sale: Sale) => {
    try {
      const receipt = await receiptService.getReceiptBySaleId(sale.id);
      setSelectedReceiptForReprint(receipt);
      setIsReprintModalOpen(true);
    } catch (err) {
      console.error('Error fetching receipt for reprint:', err);
    }
  };

  const pendingSyncSales = allSales.filter(s => s.sync_status !== 'synced');
  const filteredProducts = productSales.filter(p =>
    p.productName.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.categoryName.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Report Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <span>REPORTS &amp; AUDIT DASHBOARD</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive telemetry &bull; Financial P&amp;L, Cash Reconciliation, and Loyalty Audit Trail
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Selector */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
              ].map(d => (
                <button
                  key={d.id}
                  onClick={() => setDateRange(d.id as any)}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    dateRange === d.id ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={loadAllReports}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedReceiptForReprint(null);
                setIsReprintModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reprint Center</span>
            </button>
          </div>
        </div>

        {/* 9 Report Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 mt-4 border-t border-slate-800/80 text-xs font-semibold">
          {[
            { id: 'daily', label: 'Daily Sales', icon: Calendar },
            { id: 'cashier', label: 'Cashier Sales', icon: Users },
            { id: 'products', label: 'Product Sales', icon: Package },
            { id: 'payment_methods', label: 'Payment Methods', icon: CreditCard },
            { id: 'inventory', label: 'Inventory', icon: Boxes },
            { id: 'profit', label: 'Profit & Margins', icon: TrendingUp },
            { id: 'discounts', label: 'Discounts', icon: Percent },
            { id: 'shifts', label: 'Shifts & Cash', icon: Clock },
            { id: 'loyalty', label: 'Loyalty Audit', icon: Award },
            { id: 'queues', label: 'Notification Queues', icon: BarChart3 },
            { id: 'offline_sync', label: `Offline Sync (${pendingSyncSales.length})`, icon: RotateCcw },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ReportTab)}
                className={`px-3 py-2 rounded-xl whitespace-nowrap flex items-center gap-1.5 transition border ${
                  isActive
                    ? 'bg-sky-600 border-sky-500 text-white shadow-md'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. DAILY SALES REPORT */}
      {activeTab === 'daily' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Gross Sales Recorded</span>
              <p className="text-2xl font-bold text-white font-mono mt-1">
                {formatMoney(dailySales.reduce((acc, r) => acc + r.grossSales, 0))}
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">
                {dailySales.reduce((acc, r) => acc + r.transactionsCount, 0)} total transactions
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Net Revenue</span>
              <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                {formatMoney(dailySales.reduce((acc, r) => acc + r.netSales, 0))}
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">After line &amp; cart discounts</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Discounts Given</span>
              <p className="text-2xl font-bold text-amber-400 font-mono mt-1">
                {formatMoney(dailySales.reduce((acc, r) => acc + r.discounts, 0))}
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">Cart and product price reductions</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total VAT Collected</span>
              <p className="text-2xl font-bold text-sky-400 font-mono mt-1">
                {formatMoney(dailySales.reduce((acc, r) => acc + r.tax, 0))}
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">18% Standard rate ledger</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Date</span>
              <span>Transactions</span>
              <span>Gross Sales</span>
              <span>Discounts</span>
              <span>Net Sales</span>
              <span>VAT (18%)</span>
              <span className="text-right">Avg Ticket</span>
            </div>

            <div className="divide-y divide-slate-800/80">
              {dailySales.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">No daily sales records found.</div>
              ) : (
                dailySales.map(row => (
                  <div key={row.date} className="p-4 bg-slate-950/40 flex items-center justify-between text-xs hover:bg-slate-900/60 transition">
                    <span className="font-mono font-bold text-sky-400">{row.date}</span>
                    <span className="text-slate-300 font-mono">{row.transactionsCount} sales</span>
                    <span className="font-mono text-slate-200">{formatMoney(row.grossSales)}</span>
                    <span className="font-mono text-amber-400">{row.discounts > 0 ? `-${formatMoney(row.discounts)}` : 'UGX 0'}</span>
                    <span className="font-mono font-bold text-emerald-400">{formatMoney(row.netSales)}</span>
                    <span className="font-mono text-sky-400">{formatMoney(row.tax)}</span>
                    <span className="font-mono font-bold text-white text-right">{formatMoney(row.avgTicketValue)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. CASHIER SALES REPORT */}
      {activeTab === 'cashier' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Cashier Name</span>
            <span>Role</span>
            <span>Transactions</span>
            <span>Cash Collected</span>
            <span>Card &bull; Wallet &bull; QR</span>
            <span>Discounts</span>
            <span>Total Sales</span>
            <span className="text-right">Avg Basket</span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {cashierSales.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No cashier sales recorded yet.</div>
            ) : (
              cashierSales.map(row => (
                <div key={row.cashierId} className="p-4 bg-slate-950/40 flex items-center justify-between text-xs hover:bg-slate-900/60 transition">
                  <div>
                    <span className="font-bold text-white block">{row.cashierName}</span>
                    <span className="font-mono text-[10px] text-slate-500">ID: {row.cashierId.slice(0, 8)}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                    {row.role}
                  </span>
                  <span className="font-mono text-slate-300">{row.transactionsCount}</span>
                  <span className="font-mono text-emerald-400 font-bold">{formatMoney(row.cashSales)}</span>
                  <span className="font-mono text-sky-400">{formatMoney(row.cardSales + row.walletSales + row.qrSales)}</span>
                  <span className="font-mono text-amber-400">{formatMoney(row.discountsGiven)}</span>
                  <span className="font-mono font-extrabold text-white">{formatMoney(row.totalSales)}</span>
                  <span className="font-mono font-bold text-slate-200 text-right">{formatMoney(row.avgSale)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 3. PRODUCT SALES REPORT */}
      {activeTab === 'products' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search products, SKU or category…"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <span className="text-xs text-slate-400">{filteredProducts.length} product lines sold</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Product &amp; SKU</span>
              <span>Category</span>
              <span>Units Sold</span>
              <span>Unit Price</span>
              <span>COGS</span>
              <span>Total Revenue</span>
              <span>Gross Profit</span>
              <span className="text-right">Margin %</span>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[60vh] overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">No product sales records match search.</div>
              ) : (
                filteredProducts.map(row => (
                  <div key={row.productId} className="p-4 bg-slate-950/40 flex items-center justify-between text-xs hover:bg-slate-900/60 transition">
                    <div>
                      <span className="font-bold text-white block">{row.productName}</span>
                      <span className="font-mono text-[10px] text-slate-400">{row.sku}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/80 text-slate-300 border border-slate-700">
                      {row.categoryName}
                    </span>
                    <span className="font-mono font-bold text-white">{row.unitsSold}</span>
                    <span className="font-mono text-slate-300">{formatMoney(row.sellingPrice)}</span>
                    <span className="font-mono text-slate-400">{formatMoney(row.totalCogs)}</span>
                    <span className="font-mono font-bold text-sky-400">{formatMoney(row.totalRevenue)}</span>
                    <span className="font-mono font-bold text-emerald-400">{formatMoney(row.totalProfit)}</span>
                    <span className="font-mono font-extrabold text-white text-right">{row.marginPercent}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. PAYMENT METHODS REPORT */}
      {activeTab === 'payment_methods' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {paymentMethods.map(m => (
              <div key={m.method} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-400 uppercase">{m.label}</span>
                  <span className="text-xs font-bold text-slate-400 font-mono">{m.percentageShare}%</span>
                </div>
                <p className="text-2xl font-bold text-white font-mono mt-2">{formatMoney(m.totalAmount)}</p>
                <div className="flex justify-between items-center text-[11px] text-slate-400 mt-2">
                  <span>{m.count} transactions</span>
                  <span>Avg: {formatMoney(m.avgAmount)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Volume Share Breakdown</h3>
            <div className="space-y-3">
              {paymentMethods.map(m => (
                <div key={m.method} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">{m.label}</span>
                    <span className="text-slate-400 font-mono">{formatMoney(m.totalAmount)} ({m.percentageShare}%)</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, m.percentageShare)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. INVENTORY REPORT */}
      {activeTab === 'inventory' && inventoryReport && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Inventory (Cost)</span>
              <p className="text-2xl font-bold text-white font-mono mt-1">{formatMoney(inventoryReport.totalCostValuation)}</p>
              <span className="text-[11px] text-slate-400 mt-2 block">{inventoryReport.totalSkus} SKUs in catalog</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Retail Value</span>
              <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">{formatMoney(inventoryReport.totalRetailValuation)}</p>
              <span className="text-[11px] text-slate-400 mt-2 block">{inventoryReport.totalUnitsInStock} physical units</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Potential Gross Profit</span>
              <p className="text-2xl font-bold text-sky-400 font-mono mt-1">{formatMoney(inventoryReport.potentialProfit)}</p>
              <span className="text-[11px] text-slate-400 mt-2 block">Margin: {inventoryReport.marginPercent}%</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Low Stock Alerts</span>
              <p className="text-2xl font-bold text-rose-400 font-mono mt-1">{inventoryReport.lowStockItems.length}</p>
              <span className="text-[11px] text-slate-400 mt-2 block">At or below reorder threshold</span>
            </div>
          </div>

          {/* Low Stock Attention Table */}
          {inventoryReport.lowStockItems.length > 0 && (
            <div className="bg-slate-900 border border-rose-900/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 bg-rose-950/40 border-b border-rose-900/50 flex items-center gap-2 text-rose-300 font-bold text-xs uppercase">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Urgent: Low Stock Items Requiring Restock</span>
              </div>
              <div className="divide-y divide-slate-800/80 max-h-60 overflow-y-auto">
                {inventoryReport.lowStockItems.map(item => (
                  <div key={item.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs hover:bg-slate-900/60">
                    <div>
                      <span className="font-bold text-white block">{item.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">SKU: {item.sku} &bull; {item.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">Min: {item.min_stock_level}</span>
                      <span className="px-2.5 py-1 bg-rose-950 text-rose-300 border border-rose-800 rounded-lg font-mono font-bold">
                        Stock: {item.stock_quantity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. PROFIT REPORT */}
      {activeTab === 'profit' && profitReport && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Gross Revenue</span>
              <p className="text-2xl font-bold text-white font-mono mt-1">{formatMoney(profitReport.totalGrossRevenue)}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Cost of Goods Sold (COGS)</span>
              <p className="text-2xl font-bold text-rose-400 font-mono mt-1">{formatMoney(profitReport.totalCogs)}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Net Gross Profit</span>
              <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">{formatMoney(profitReport.totalGrossProfit)}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Gross Profit Margin</span>
              <p className="text-2xl font-bold text-sky-400 font-mono mt-1">{profitReport.grossMarginPercent}%</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Category</span>
              <span>Revenue</span>
              <span>COGS</span>
              <span>Gross Profit</span>
              <span className="text-right">Margin %</span>
            </div>
            <div className="divide-y divide-slate-800/80">
              {profitReport.categoryProfitability.map(cat => (
                <div key={cat.categoryName} className="p-4 bg-slate-950/40 flex items-center justify-between text-xs hover:bg-slate-900/60 transition">
                  <span className="font-bold text-white">{cat.categoryName}</span>
                  <span className="font-mono text-sky-400">{formatMoney(cat.revenue)}</span>
                  <span className="font-mono text-rose-400">{formatMoney(cat.cogs)}</span>
                  <span className="font-mono font-bold text-emerald-400">{formatMoney(cat.profit)}</span>
                  <span className="font-mono font-extrabold text-white text-right">{cat.margin}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. DISCOUNTS REPORT */}
      {activeTab === 'discounts' && discountsReport && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Discounts Given</span>
              <p className="text-2xl font-bold text-amber-400 font-mono mt-1">{formatMoney(discountsReport.totalDiscountsGiven)}</p>
              <span className="text-[11px] text-slate-400 mt-2 block">Discount Rate: {discountsReport.discountRatePercent}%</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Item-Level Discounts</span>
              <p className="text-2xl font-bold text-white font-mono mt-1">{formatMoney(discountsReport.itemLevelDiscounts)}</p>
              <span className="text-[11px] text-slate-400 mt-2 block">Promotional price reductions</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Cart-Level Discounts</span>
              <p className="text-2xl font-bold text-white font-mono mt-1">{formatMoney(discountsReport.cartLevelDiscounts)}</p>
              <span className="text-[11px] text-slate-400 mt-2 block">Basket percentage / fixed reductions</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Discounted Sales</span>
              <p className="text-2xl font-bold text-sky-400 font-mono mt-1">
                {discountsReport.discountedTransactionsCount} / {discountsReport.totalTransactionsCount}
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">Transactions with discounts</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
              Top Discounted Products
            </div>
            <div className="divide-y divide-slate-800/80">
              {discountsReport.topDiscountedProducts.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">No item discounts recorded.</div>
              ) : (
                discountsReport.topDiscountedProducts.map(p => (
                  <div key={p.productId} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white">{p.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono block">SKU: {p.sku}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400 font-mono">{p.timesDiscounted} times</span>
                      <span className="font-mono font-bold text-amber-400">-{formatMoney(p.totalDiscount)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. SHIFTS & RECONCILIATION REPORT */}
      {activeTab === 'shifts' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Shift Details</span>
              <span>Opening Float</span>
              <span>Cash Sales</span>
              <span>Pay In / Out</span>
              <span>Expected Cash</span>
              <span>Actual Counted</span>
              <span className="text-right">Variance</span>
            </div>

            <div className="divide-y divide-slate-800/80">
              {shiftsReport.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">No shift records found.</div>
              ) : (
                shiftsReport.map(s => {
                  return (
                    <div key={s.shiftId} className="p-4 bg-slate-950/40 space-y-2 hover:bg-slate-900/60 transition">
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{s.cashierName}</span>
                            <span className="text-[10px] font-mono text-slate-400">({s.registerName})</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                s.status === 'open'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {s.status}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Opened: {new Date(s.openedAt).toLocaleString()}
                            {s.closedAt ? ` &bull; Closed: ${new Date(s.closedAt).toLocaleString()}` : ''}
                          </span>
                        </div>

                        <span className="font-mono text-slate-300">{formatMoney(s.openingFloat)}</span>
                        <span className="font-mono text-emerald-400 font-bold">{formatMoney(s.cashSales)}</span>
                        <span className="font-mono text-sky-400">
                          +{formatMoney(s.cashIn)} / -{formatMoney(s.cashOut)}
                        </span>
                        <span className="font-mono text-white font-bold">{formatMoney(s.expectedCash)}</span>
                        <span className="font-mono text-slate-200">
                          {s.actualCash !== undefined ? formatMoney(s.actualCash) : '—'}
                        </span>
                        <div className="text-right font-mono">
                          {s.variance !== undefined ? (
                            <span
                              className={`font-bold px-2 py-0.5 rounded-md ${
                                s.variance === 0
                                  ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/40'
                                  : s.variance > 0
                                  ? 'text-sky-400 bg-sky-950/40 border border-sky-800/40'
                                  : 'text-rose-400 bg-rose-950/40 border border-rose-800/40'
                              }`}
                            >
                              {s.variance > 0 ? `+${formatMoney(s.variance)}` : formatMoney(s.variance)}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </div>
                      </div>

                      {/* Cash movements drawer audit */}
                      {s.movements.length > 0 && (
                        <div className="pl-4 pt-1 border-l-2 border-slate-800 space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Cash Movements ({s.movements.length}):
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11px]">
                            {s.movements.map(m => (
                              <div key={m.id} className="p-1.5 bg-slate-900/80 rounded border border-slate-800 flex justify-between items-center">
                                <span className="text-slate-300 truncate max-w-[150px]">{m.reason}</span>
                                <span className={`font-mono font-bold ${m.type === 'PAY_IN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {m.type === 'PAY_IN' ? '+' : '-'}{formatMoney(m.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. LOYALTY AUDIT REPORT */}
      {activeTab === 'loyalty' && loyaltyReport && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Points Issued</span>
              <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                +{loyaltyReport.totalPointsIssued.toLocaleString()} pts
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">Accrued across checkouts</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Total Points Redeemed</span>
              <p className="text-2xl font-bold text-purple-400 font-mono mt-1">
                -{loyaltyReport.totalPointsRedeemed.toLocaleString()} pts
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">Used for customer discounts</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Points Liability (Balance)</span>
              <p className="text-2xl font-bold text-amber-400 font-mono mt-1">
                {loyaltyReport.totalPointsLiability.toLocaleString()} pts
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">Unredeemed customer points</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 uppercase">Active Loyalty Members</span>
              <p className="text-2xl font-bold text-sky-400 font-mono mt-1">
                {loyaltyReport.activeLoyaltyCustomersCount}
              </p>
              <span className="text-[11px] text-slate-400 mt-2 block">Customers with &gt; 0 points</span>
            </div>
          </div>

          {/* Chronological Loyalty Audit Log using LOYALTY TRANSACTION cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Immutable Loyalty Transaction Audit Trail</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {loyaltyReport.recentTransactions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs col-span-2">
                  No loyalty transactions recorded yet.
                </div>
              ) : (
                loyaltyReport.recentTransactions.map(tx => (
                  <LoyaltyLedgerCard key={tx.id} transaction={tx} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION QUEUES TAB */}
      {activeTab === 'queues' && <NotificationQueuesView />}

      {/* OFFLINE SYNC TAB */}
      {activeTab === 'offline_sync' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-white">Pending Offline Transactions</h3>
              <p className="text-xs text-slate-400">Transactions saved locally awaiting cloud sync</p>
            </div>
            <span className="px-3 py-1 bg-amber-950 text-amber-300 border border-amber-800 rounded-xl text-xs font-bold font-mono">
              {pendingSyncSales.length} Pending
            </span>
          </div>

          <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
            {pendingSyncSales.length === 0 ? (
              <div className="p-8 text-center text-emerald-400 text-xs">
                All transactions are synchronized with the cloud.
              </div>
            ) : (
              pendingSyncSales.map(s => (
                <div key={s.id} className="p-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-mono font-bold text-sky-400 block">{s.receipt_number}</span>
                    <span className="text-slate-500">{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-white">{formatMoney(s.total_amount)}</span>
                    <button
                      onClick={() => handleOpenReprintForSale(s)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                      title="Reprint Receipt"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
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
          onClose={() => setIsReprintModalOpen(false)}
        />
      )}
    </div>
  );
};
