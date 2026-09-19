import { db, PosDatabase } from '../db';
import { Product, Category, User, CashMovement, LoyaltyTransaction, Customer } from '../types';

export interface DailySalesRow {
  date: string; // YYYY-MM-DD
  grossSales: number; // UGX minor
  discounts: number;
  netSales: number;
  tax: number;
  total: number;
  transactionsCount: number;
  avgTicketValue: number;
}

export interface CashierSalesRow {
  cashierId: string;
  cashierName: string;
  role: string;
  transactionsCount: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  walletSales: number;
  qrSales: number;
  discountsGiven: number;
  avgSale: number;
}

export interface ProductSalesRow {
  productId: string;
  productName: string;
  sku: string;
  categoryName: string;
  unitsSold: number;
  sellingPrice: number;
  totalRevenue: number;
  totalCogs: number;
  totalProfit: number;
  marginPercent: number;
}

export interface PaymentMethodRow {
  method: string;
  label: string;
  count: number;
  totalAmount: number;
  percentageShare: number;
  avgAmount: number;
}

export interface InventoryReportData {
  totalSkus: number;
  totalUnitsInStock: number;
  totalCostValuation: number;
  totalRetailValuation: number;
  potentialProfit: number;
  marginPercent: number;
  lowStockItems: (Product & { categoryName?: string })[];
  recentMovements: any[];
}

export interface ProfitReportData {
  totalGrossRevenue: number;
  totalCogs: number;
  totalDiscounts: number;
  totalGrossProfit: number;
  grossMarginPercent: number;
  dailyBreakdown: { date: string; revenue: number; cogs: number; profit: number; margin: number }[];
  categoryProfitability: { categoryName: string; revenue: number; cogs: number; profit: number; margin: number }[];
}

export interface DiscountsReportData {
  totalDiscountsGiven: number;
  itemLevelDiscounts: number;
  cartLevelDiscounts: number;
  discountedTransactionsCount: number;
  totalTransactionsCount: number;
  discountRatePercent: number;
  topDiscountedProducts: { productId: string; name: string; sku: string; totalDiscount: number; timesDiscounted: number }[];
  cashierDiscounts: { cashierName: string; totalDiscounts: number; transactionCount: number }[];
}

export interface ShiftReportRow {
  shiftId: string;
  cashierName: string;
  registerName: string;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  openingFloat: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
  movements: CashMovement[];
}

export interface LoyaltyReportData {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsLiability: number;
  activeLoyaltyCustomersCount: number;
  topCustomers: Customer[];
  recentTransactions: LoyaltyTransaction[];
}

export class ReportService {
  constructor(private readonly database: PosDatabase = db) {}

  /**
   * 1. Daily Sales Report
   */
  async getDailySalesReport(startDate?: string, endDate?: string): Promise<DailySalesRow[]> {
    let sales = await this.database.sales.toArray();
    if (startDate) sales = sales.filter(s => s.created_at >= startDate);
    if (endDate) sales = sales.filter(s => s.created_at <= endDate);

    const map = new Map<string, {
      grossSales: number;
      discounts: number;
      tax: number;
      total: number;
      count: number;
    }>();

    for (const sale of sales) {
      const dateKey = sale.created_at.slice(0, 10);
      const cur = map.get(dateKey) || { grossSales: 0, discounts: 0, tax: 0, total: 0, count: 0 };
      cur.grossSales += sale.subtotal + sale.discount_amount;
      cur.discounts += sale.discount_amount;
      cur.tax += sale.tax_amount;
      cur.total += sale.total_amount;
      cur.count += 1;
      map.set(dateKey, cur);
    }

    const rows: DailySalesRow[] = [];
    for (const [date, data] of map.entries()) {
      const netSales = data.grossSales - data.discounts;
      const avgTicketValue = data.count > 0 ? Math.round(data.total / data.count) : 0;
      rows.push({
        date,
        grossSales: data.grossSales,
        discounts: data.discounts,
        netSales,
        tax: data.tax,
        total: data.total,
        transactionsCount: data.count,
        avgTicketValue,
      });
    }

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * 2. Cashier Sales Report
   */
  async getCashierSalesReport(startDate?: string, endDate?: string): Promise<CashierSalesRow[]> {
    let [sales, users] = await Promise.all([
      this.database.sales.toArray(),
      this.database.users.toArray(),
    ]);

    if (startDate) sales = sales.filter(s => s.created_at >= startDate);
    if (endDate) sales = sales.filter(s => s.created_at <= endDate);

    const userMap = new Map<string, User>();
    users.forEach(u => userMap.set(u.id, u));

    const map = new Map<string, {
      count: number;
      totalSales: number;
      cashSales: number;
      cardSales: number;
      walletSales: number;
      qrSales: number;
      discountsGiven: number;
    }>();

    for (const sale of sales) {
      const cId = sale.cashier_id;
      const cur = map.get(cId) || {
        count: 0,
        totalSales: 0,
        cashSales: 0,
        cardSales: 0,
        walletSales: 0,
        qrSales: 0,
        discountsGiven: 0,
      };

      cur.count += 1;
      cur.totalSales += sale.total_amount;
      cur.discountsGiven += sale.discount_amount;

      if (sale.payment_method === 'cash') cur.cashSales += sale.total_amount;
      else if (sale.payment_method === 'card') cur.cardSales += sale.total_amount;
      else if (sale.payment_method === 'wallet') cur.walletSales += sale.total_amount;
      else if (sale.payment_method === 'qr') cur.qrSales += sale.total_amount;
      else if (sale.payment_method === 'split') cur.cashSales += sale.total_amount; // fallback

      map.set(cId, cur);
    }

    const rows: CashierSalesRow[] = [];
    for (const [cId, data] of map.entries()) {
      const user = userMap.get(cId);
      const cashierName = user?.name || user?.username || `Cashier (${cId.slice(0, 6)})`;
      const role = user?.role || 'cashier';
      const avgSale = data.count > 0 ? Math.round(data.totalSales / data.count) : 0;

      rows.push({
        cashierId: cId,
        cashierName,
        role,
        transactionsCount: data.count,
        totalSales: data.totalSales,
        cashSales: data.cashSales,
        cardSales: data.cardSales,
        walletSales: data.walletSales,
        qrSales: data.qrSales,
        discountsGiven: data.discountsGiven,
        avgSale,
      });
    }

    return rows.sort((a, b) => b.totalSales - a.totalSales);
  }

  /**
   * 3. Product Sales Report
   */
  async getProductSalesReport(startDate?: string, endDate?: string): Promise<ProductSalesRow[]> {
    let [sales, saleItems, products, categories] = await Promise.all([
      this.database.sales.toArray(),
      this.database.saleItems.toArray(),
      this.database.products.toArray(),
      this.database.categories.toArray(),
    ]);

    if (startDate) sales = sales.filter(s => s.created_at >= startDate);
    if (endDate) sales = sales.filter(s => s.created_at <= endDate);

    if (startDate || endDate) {
      const validSaleIds = new Set(sales.map(s => s.id));
      saleItems = saleItems.filter(i => validSaleIds.has(i.sale_id));
    }

    const productMap = new Map<string, Product>();
    products.forEach(p => productMap.set(p.id, p));

    const categoryMap = new Map<string, Category>();
    categories.forEach(c => categoryMap.set(c.id, c));

    // Map sale items
    const agg = new Map<string, {
      name: string;
      sku: string;
      categoryId?: string;
      unitsSold: number;
      revenue: number;
    }>();

    for (const item of saleItems) {
      const cur = agg.get(item.product_id) || {
        name: item.product_name,
        sku: item.sku,
        unitsSold: 0,
        revenue: 0,
      };
      cur.unitsSold += item.quantity;
      cur.revenue += item.total_price;
      agg.set(item.product_id, cur);
    }

    const rows: ProductSalesRow[] = [];
    for (const [prodId, data] of agg.entries()) {
      const prod = productMap.get(prodId);
      const cat = prod ? categoryMap.get(prod.category_id) : undefined;
      const costPrice = prod?.cost_price || 0;
      const sellingPrice = prod?.selling_price || (data.unitsSold > 0 ? Math.round(data.revenue / data.unitsSold) : 0);
      const totalCogs = costPrice * data.unitsSold;
      const totalProfit = data.revenue - totalCogs;
      const marginPercent = data.revenue > 0 ? Math.round((totalProfit / data.revenue) * 1000) / 10 : 0;

      rows.push({
        productId: prodId,
        productName: data.name,
        sku: data.sku,
        categoryName: cat?.name || 'General',
        unitsSold: data.unitsSold,
        sellingPrice,
        totalRevenue: data.revenue,
        totalCogs,
        totalProfit,
        marginPercent,
      });
    }

    return rows.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  /**
   * 4. Payment Methods Report
   */
  async getPaymentMethodsReport(startDate?: string, endDate?: string): Promise<PaymentMethodRow[]> {
    let sales = await this.database.sales.toArray();
    if (startDate) sales = sales.filter(s => s.created_at >= startDate);
    if (endDate) sales = sales.filter(s => s.created_at <= endDate);

    const grandTotal = sales.reduce((sum, s) => sum + s.total_amount, 0);

    const methods = [
      { method: 'cash', label: 'Cash' },
      { method: 'card', label: 'Card' },
      { method: 'wallet', label: 'Mobile Wallet' },
      { method: 'qr', label: 'QR Code' },
      { method: 'split', label: 'Split Payments' },
    ];

    return methods.map(m => {
      const methodSales = sales.filter(s => s.payment_method === m.method);
      const count = methodSales.length;
      const totalAmount = methodSales.reduce((sum, s) => sum + s.total_amount, 0);
      const percentageShare = grandTotal > 0 ? Math.round((totalAmount / grandTotal) * 1000) / 10 : 0;
      const avgAmount = count > 0 ? Math.round(totalAmount / count) : 0;

      return {
        method: m.method,
        label: m.label,
        count,
        totalAmount,
        percentageShare,
        avgAmount,
      };
    });
  }

  /**
   * 5. Inventory Report
   */
  async getInventoryReport(): Promise<InventoryReportData> {
    const [products, categories, movements] = await Promise.all([
      this.database.products.toArray(),
      this.database.categories.toArray(),
      this.database.inventoryMovements.reverse().sortBy('timestamp'),
    ]);

    const catMap = new Map<string, string>();
    categories.forEach(c => catMap.set(c.id, c.name));

    let totalUnitsInStock = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;

    const lowStockItems: (Product & { categoryName?: string })[] = [];

    for (const p of products) {
      const qty = p.stock_quantity || 0;
      totalUnitsInStock += qty;
      totalCostValuation += qty * (p.cost_price || 0);
      totalRetailValuation += qty * (p.selling_price || 0);

      if (qty <= (p.min_stock_level || 5)) {
        lowStockItems.push({
          ...p,
          categoryName: catMap.get(p.category_id) || 'General',
        });
      }
    }

    const potentialProfit = totalRetailValuation - totalCostValuation;
    const marginPercent = totalRetailValuation > 0 ? Math.round((potentialProfit / totalRetailValuation) * 1000) / 10 : 0;

    return {
      totalSkus: products.length,
      totalUnitsInStock,
      totalCostValuation,
      totalRetailValuation,
      potentialProfit,
      marginPercent,
      lowStockItems: lowStockItems.sort((a, b) => a.stock_quantity - b.stock_quantity),
      recentMovements: movements.slice(0, 50),
    };
  }

  /**
   * 6. Profit (P&L) Report
   */
  async getProfitReport(startDate?: string, endDate?: string): Promise<ProfitReportData> {
    let [sales, saleItems, products, categories] = await Promise.all([
      this.database.sales.toArray(),
      this.database.saleItems.toArray(),
      this.database.products.toArray(),
      this.database.categories.toArray(),
    ]);

    if (startDate) sales = sales.filter(s => s.created_at >= startDate);
    if (endDate) sales = sales.filter(s => s.created_at <= endDate);

    const validSaleIds = new Set(sales.map(s => s.id));
    const filteredItems = saleItems.filter(i => validSaleIds.has(i.sale_id));

    const productCostMap = new Map<string, number>();
    const productCatMap = new Map<string, string>();
    products.forEach(p => {
      productCostMap.set(p.id, p.cost_price || 0);
      productCatMap.set(p.id, p.category_id);
    });

    const categoryNameMap = new Map<string, string>();
    categories.forEach(c => categoryNameMap.set(c.id, c.name));

    let totalGrossRevenue = 0;
    let totalCogs = 0;
    let totalDiscounts = 0;

    sales.forEach(s => {
      totalGrossRevenue += s.subtotal + s.discount_amount;
      totalDiscounts += s.discount_amount;
    });

    // Daily breakdown map
    const dailyMap = new Map<string, { revenue: number; cogs: number }>();
    // Category map
    const catAggMap = new Map<string, { revenue: number; cogs: number }>();

    for (const item of filteredItems) {
      const itemCost = (productCostMap.get(item.product_id) || 0) * item.quantity;
      totalCogs += itemCost;

      const dateKey = (item as any).created_at ? (item as any).created_at.slice(0, 10) : 'General';
      const curDaily = dailyMap.get(dateKey) || { revenue: 0, cogs: 0 };
      curDaily.revenue += item.total_price;
      curDaily.cogs += itemCost;
      dailyMap.set(dateKey, curDaily);

      const catId = productCatMap.get(item.product_id) || 'other';
      const curCat = catAggMap.get(catId) || { revenue: 0, cogs: 0 };
      curCat.revenue += item.total_price;
      curCat.cogs += itemCost;
      catAggMap.set(catId, curCat);
    }

    const totalGrossProfit = totalGrossRevenue - totalCogs - totalDiscounts;
    const grossMarginPercent = totalGrossRevenue > 0 ? Math.round((totalGrossProfit / totalGrossRevenue) * 1000) / 10 : 0;

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, d]) => {
      const profit = d.revenue - d.cogs;
      const margin = d.revenue > 0 ? Math.round((profit / d.revenue) * 1000) / 10 : 0;
      return { date, revenue: d.revenue, cogs: d.cogs, profit, margin };
    }).sort((a, b) => b.date.localeCompare(a.date));

    const categoryProfitability = Array.from(catAggMap.entries()).map(([catId, d]) => {
      const profit = d.revenue - d.cogs;
      const margin = d.revenue > 0 ? Math.round((profit / d.revenue) * 1000) / 10 : 0;
      return {
        categoryName: categoryNameMap.get(catId) || 'Uncategorized',
        revenue: d.revenue,
        cogs: d.cogs,
        profit,
        margin,
      };
    }).sort((a, b) => b.profit - a.profit);

    return {
      totalGrossRevenue,
      totalCogs,
      totalDiscounts,
      totalGrossProfit,
      grossMarginPercent,
      dailyBreakdown,
      categoryProfitability,
    };
  }

  /**
   * 7. Discounts Report
   */
  async getDiscountsReport(startDate?: string, endDate?: string): Promise<DiscountsReportData> {
    let [sales, saleItems, users] = await Promise.all([
      this.database.sales.toArray(),
      this.database.saleItems.toArray(),
      this.database.users.toArray(),
    ]);

    if (startDate) sales = sales.filter(s => s.created_at >= startDate);
    if (endDate) sales = sales.filter(s => s.created_at <= endDate);

    const userMap = new Map<string, string>();
    users.forEach(u => userMap.set(u.id, u.name || u.username));

    const totalDiscountsGiven = sales.reduce((sum, s) => sum + s.discount_amount, 0);
    const grossRevenue = sales.reduce((sum, s) => sum + s.subtotal + s.discount_amount, 0);
    const discountedSales = sales.filter(s => s.discount_amount > 0);

    const itemDiscounts = saleItems.reduce((sum, item) => sum + ((item.discount_amount || 0) * item.quantity), 0);
    const cartDiscounts = Math.max(0, totalDiscountsGiven - itemDiscounts);

    // Top discounted products
    const prodDiscountMap = new Map<string, { name: string; sku: string; totalDiscount: number; times: number }>();
    for (const item of saleItems) {
      if ((item.discount_amount || 0) > 0) {
        const cur = prodDiscountMap.get(item.product_id) || {
          name: item.product_name,
          sku: item.sku,
          totalDiscount: 0,
          times: 0,
        };
        cur.totalDiscount += item.discount_amount * item.quantity;
        cur.times += 1;
        prodDiscountMap.set(item.product_id, cur);
      }
    }

    const topDiscountedProducts = Array.from(prodDiscountMap.entries()).map(([productId, d]) => ({
      productId,
      name: d.name,
      sku: d.sku,
      totalDiscount: d.totalDiscount,
      timesDiscounted: d.times,
    })).sort((a, b) => b.totalDiscount - a.totalDiscount);

    // Cashier discount totals
    const cashierMap = new Map<string, { totalDiscounts: number; count: number }>();
    for (const sale of sales) {
      if (sale.discount_amount > 0) {
        const cId = sale.cashier_id;
        const cur = cashierMap.get(cId) || { totalDiscounts: 0, count: 0 };
        cur.totalDiscounts += sale.discount_amount;
        cur.count += 1;
        cashierMap.set(cId, cur);
      }
    }

    const cashierDiscounts = Array.from(cashierMap.entries()).map(([cId, d]) => ({
      cashierName: userMap.get(cId) || `Cashier (${cId.slice(0, 6)})`,
      totalDiscounts: d.totalDiscounts,
      transactionCount: d.count,
    })).sort((a, b) => b.totalDiscounts - a.totalDiscounts);

    const discountRatePercent = grossRevenue > 0 ? Math.round((totalDiscountsGiven / grossRevenue) * 1000) / 10 : 0;

    return {
      totalDiscountsGiven,
      itemLevelDiscounts: itemDiscounts,
      cartLevelDiscounts: cartDiscounts,
      discountedTransactionsCount: discountedSales.length,
      totalTransactionsCount: sales.length,
      discountRatePercent,
      topDiscountedProducts,
      cashierDiscounts,
    };
  }

  /**
   * 8. Shifts Report
   */
  async getShiftsReport(): Promise<ShiftReportRow[]> {
    const [shifts, cashMovements, users, registers] = await Promise.all([
      this.database.shifts.reverse().sortBy('opened_at'),
      this.database.cashMovements.toArray(),
      this.database.users.toArray(),
      this.database.registers.toArray(),
    ]);

    const userMap = new Map<string, string>();
    users.forEach(u => userMap.set(u.id, u.name || u.username));

    const regMap = new Map<string, string>();
    registers.forEach(r => regMap.set(r.id, r.register_name));

    const movementsByShift = new Map<string, CashMovement[]>();
    for (const m of cashMovements) {
      const list = movementsByShift.get(m.shift_id) || [];
      list.push(m);
      movementsByShift.set(m.shift_id, list);
    }

    return shifts.map(shift => {
      const movs = movementsByShift.get(shift.id) || [];
      const cashIn = movs.filter(m => m.type === 'PAY_IN').reduce((sum, m) => sum + m.amount, 0);
      const cashOut = movs.filter(m => m.type === 'PAY_OUT' || m.type === 'SAFE_DROP').reduce((sum, m) => sum + m.amount, 0);

      const openingFloat = shift.opening_float || 0;
      const cashSales = shift.cash_sales_total || 0;
      const expectedCash = shift.closing_cash_expected ?? (openingFloat + cashSales + cashIn - cashOut);

      return {
        shiftId: shift.id,
        cashierName: userMap.get(shift.cashier_id) || `Cashier (${shift.cashier_id.slice(0, 6)})`,
        registerName: regMap.get(shift.register_id) || `Register (${shift.register_id.slice(0, 6)})`,
        openedAt: shift.opened_at,
        closedAt: shift.closed_at,
        status: shift.status,
        openingFloat,
        cashSales,
        cashIn: shift.cash_in_total ?? cashIn,
        cashOut: shift.cash_out_total ?? cashOut,
        expectedCash,
        actualCash: shift.closing_cash_actual,
        variance: shift.variance,
        movements: movs,
      };
    });
  }

  /**
   * 9. Loyalty Report
   */
  async getLoyaltyReport(): Promise<LoyaltyReportData> {
    const [customers, transactions] = await Promise.all([
      this.database.customers.toArray(),
      this.database.loyaltyTransactions.reverse().sortBy('timestamp'),
    ]);

    const totalPointsLiability = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);

    const totalPointsIssued = transactions
      .filter(t => t.type === 'EARN' || (t.type === 'ADJUST' && t.points_delta > 0))
      .reduce((sum, t) => sum + t.points_delta, 0);

    const totalPointsRedeemed = transactions
      .filter(t => t.type === 'REDEEM' || (t.type === 'ADJUST' && t.points_delta < 0))
      .reduce((sum, t) => sum + Math.abs(t.points_delta), 0);

    const activeLoyaltyCustomersCount = customers.filter(c => (c.loyalty_points || 0) > 0).length;

    const topCustomers = [...customers].sort((a, b) => (b.loyalty_points || 0) - (a.loyalty_points || 0)).slice(0, 20);

    return {
      totalPointsIssued,
      totalPointsRedeemed,
      totalPointsLiability,
      activeLoyaltyCustomersCount,
      topCustomers,
      recentTransactions: transactions.slice(0, 100),
    };
  }
}

export const reportService = new ReportService();
