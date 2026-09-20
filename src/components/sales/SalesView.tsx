import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Scan,
  Plus,
  Minus,
  X,
  Trash2,
  CreditCard,
  Gift,
  PauseCircle,
  Tag,
  ChevronDown,
  Printer,
  Package,
  CheckCircle,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { productRepository, categoryRepository } from '../../db';
import { Product, Category } from '../../types';
import { calculateCartTotals, formatMoney } from '../../utils/money';
import { useBarcodeScanner } from '../../services/barcodeService';
import { ReprintModal } from '../pos/ReprintModal';

export const SalesView: React.FC = () => {
  const {
    cartItems,
    selectedCustomer,
    cartDiscountPercent,
    cartDiscountFixed,
    addToCart,
    updateCartItemQuantity,
    removeCartItem,
    setCartDiscount,
    startNewSale,
    proceedToPayment,
    proceedToCustomer,
    suspendCurrentSale,
    setIssueLoyaltyCardOpen,
    setStockAlertOpen,
    setProductNotFoundOpen,
    setActiveWorkflowStep,
  } = usePos();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isReprintOpen, setIsReprintOpen] = useState<boolean>(false);
  const [isDiscountPopoverOpen, setIsDiscountPopoverOpen] = useState<boolean>(false);
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('');
  const [justAddedProductId, setJustAddedProductId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    const [allProducts, allCategories] = await Promise.all([
      productRepository.getActiveProducts(),
      categoryRepository.getAllActive(),
    ]);
    setProducts(allProducts);
    setCategories(allCategories);
  };

  /**
   * Barcode Scanner Support
   */
  useBarcodeScanner({
    onScan: (scannedBarcode: string) => {
      handleBarcodeScanned(scannedBarcode);
    },
  });

  const handleBarcodeScanned = async (barcode: string) => {
    const matchedProduct =
      (await productRepository.getByBarcode(barcode)) ||
      (await productRepository.getBySku(barcode));

    if (!matchedProduct) {
      setProductNotFoundOpen(true, barcode);
      return;
    }

    if (matchedProduct.stock_quantity <= 0) {
      setStockAlertOpen(
        true,
        `OUT OF STOCK: "${matchedProduct.name}" (SKU: ${matchedProduct.sku}) has 0 units available.`
      );
      return;
    }

    const success = addToCart(matchedProduct, 1);
    if (success) {
      setJustAddedProductId(matchedProduct.id);
      setTimeout(() => setJustAddedProductId(null), 1000);
      setActiveWorkflowStep(7);
    }
  };

  const handleProductSelect = (product: Product) => {
    if (product.stock_quantity <= 0) {
      setStockAlertOpen(
        true,
        `OUT OF STOCK: "${product.name}" (SKU: ${product.sku}) has 0 units available.`
      );
      return;
    }
    const success = addToCart(product, 1);
    if (success) {
      setJustAddedProductId(product.id);
      setTimeout(() => setJustAddedProductId(null), 1000);
      setActiveWorkflowStep(7);
    }
  };

  // Filter products by search and category
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesCategory;

    const matchesQuery =
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q);

    return matchesCategory && matchesQuery;
  });

  // Financial totals
  const totals = calculateCartTotals(cartItems, cartDiscountPercent, cartDiscountFixed);

  const handleApplyDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    const percent = parseFloat(discountPercentInput) || 0;
    setCartDiscount(Math.min(100, Math.max(0, percent)), 0);
    setIsDiscountPopoverOpen(false);
  };

  const handleTriggerScanner = () => {
    searchInputRef.current?.focus();
    // Emulate scanner prompt or focus input
    const sampleBarcodes = products.map(p => p.barcode).filter(Boolean);
    if (sampleBarcodes.length > 0) {
      // Prompt user or focus
      searchInputRef.current?.setAttribute('placeholder', 'Scanner ready: enter barcode...');
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-slate-100 dark:bg-slate-900 select-none text-slate-800 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* =================================================================== */}
      {/* LEFT COLUMN: Cart, Customer & Checkout Panel (Matching Reference)  */}
      {/* =================================================================== */}
      <div className="w-full lg:w-[45%] xl:w-[42%] flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 relative z-10">
        {/* Row 1: Customer Selection & Quick Add */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveWorkflowStep(9);
              proceedToCustomer();
            }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-xs font-semibold hover:border-indigo-500 transition shadow-sm"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="truncate">
                {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
              </span>
              {selectedCustomer && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                  {selectedCustomer.loyalty_points} pts
                </span>
              )}
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Quick Add Customer Button (+) */}
          <button
            type="button"
            onClick={() => {
              setActiveWorkflowStep(9);
              proceedToCustomer();
            }}
            title="Add New Customer"
            className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center font-bold transition shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Row 2: Secondary POS Action Buttons */}
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-950/40">
          {/* Issue Loyalty Card (Purple) */}
          <button
            type="button"
            onClick={() => setIssueLoyaltyCardOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm active:scale-95"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Issue Loyalty Card</span>
          </button>

          {/* Suspend Sales (Amber) */}
          <button
            type="button"
            disabled={cartItems.length === 0}
            onClick={() => {
              if (cartItems.length > 0) {
                suspendCurrentSale();
              }
            }}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm active:scale-95"
          >
            <PauseCircle className="w-3.5 h-3.5" />
            <span>Suspend Sales</span>
          </button>

          {/* Receipts / Reprint */}
          <button
            type="button"
            onClick={() => setIsReprintOpen(true)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            title="Receipts & Reprints"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>

        {/* Row 3: Itemized Cart Table */}
        <div className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-indigo-400/40">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold z-10">
              <tr>
                <th className="py-2.5 px-3">Items</th>
                <th className="py-2.5 px-2 text-right">Price</th>
                <th className="py-2.5 px-2 text-center">Qty</th>
                <th className="py-2.5 px-2 text-right">Subtotal</th>
                <th className="py-2.5 px-3 text-center w-8">
                  {cartItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => startNewSale()}
                      className="text-slate-400 hover:text-rose-500 transition"
                      title="Clear Cart"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {cartItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-xs text-slate-500">Cart is empty</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Select or scan products from the right panel
                    </p>
                  </td>
                </tr>
              ) : (
                cartItems.map(item => (
                  <tr
                    key={item.product.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition group"
                  >
                    {/* Item Name */}
                    <td className="py-3 px-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                        {item.product.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.product.sku}</p>
                    </td>

                    {/* Unit Price */}
                    <td className="py-3 px-2 text-right font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatMoney(item.unit_price)}
                    </td>

                    {/* Quantity Stepper Box */}
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      <div className="inline-flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-950 shadow-sm">
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.product.id, item.quantity - 1)}
                          className="px-1.5 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-7 text-center font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.product.id, item.quantity + 1)}
                          className="px-1.5 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    {/* Subtotal */}
                    <td className="py-3 px-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatMoney(item.item_total)}
                    </td>

                    {/* Remove Row */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.product.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded-md transition"
                        title="Remove item"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Row 4: Bottom Financial Summary & Big Purple Payment Button */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950 flex flex-col gap-2">
          {/* Discount & VAT breakdown */}
          <div className="flex justify-end gap-6 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <button
              type="button"
              onClick={() => setIsDiscountPopoverOpen(!isDiscountPopoverOpen)}
              className="flex items-center gap-1 hover:text-indigo-600 transition"
            >
              <Tag className="w-3 h-3" />
              <span>
                Discount: <strong className="text-slate-800 dark:text-slate-200">{formatMoney(totals.totalDiscount)}</strong>
              </span>
            </button>
            <div>
              VAT: <strong className="text-slate-800 dark:text-slate-200">{formatMoney(totals.taxTotal)}</strong>
            </div>
          </div>

          {/* Discount adjust popover */}
          {isDiscountPopoverOpen && (
            <form onSubmit={handleApplyDiscount} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md">
              <span className="text-[11px] font-semibold text-slate-500">Cart Discount %:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={discountPercentInput}
                onChange={e => setDiscountPercentInput(e.target.value)}
                placeholder="10"
                className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
              >
                Apply
              </button>
              {cartDiscountPercent > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCartDiscount(0, 0);
                    setIsDiscountPopoverOpen(false);
                  }}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Reset
                </button>
              )}
            </form>
          )}

          {/* Main Checkout Bar: Total on left, Big Purple Button on right */}
          <div className="flex items-center justify-between gap-4 pt-1">
            {/* Total Block */}
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total</span>
              <div className="flex items-baseline gap-1 text-slate-900 dark:text-white font-mono">
                <span className="text-2xl lg:text-3xl font-black tracking-tight">
                  {formatMoney(totals.grandTotal)}
                </span>
              </div>
            </div>

            {/* Prominent Purple Payment CTA (Exact Match to Inspiration) */}
            <button
              type="button"
              disabled={cartItems.length === 0}
              onClick={() => {
                setActiveWorkflowStep(10);
                proceedToPayment();
              }}
              className="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-600/30 active:scale-95 transition"
            >
              <CreditCard className="w-5 h-5" />
              <span className="text-base font-bold">Payment</span>
            </button>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* RIGHT COLUMN: Search Bar, Category Chips & 5-Column Product Grid   */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950/60 p-4 gap-3">
        {/* Top Search & Barcode Trigger Row */}
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleBarcodeScanned(searchQuery);
              }
            }}
            placeholder="Type product name or scan barcode"
            className="w-full pl-12 pr-12 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition font-medium"
          />
          <button
            type="button"
            onClick={handleTriggerScanner}
            title="Scan Barcode with Camera / Scanner"
            className="absolute right-3 p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <Scan className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 shrink-0 text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition border ${
              selectedCategoryId === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
            }`}
          >
            All Products ({products.length})
          </button>
          {categories.map(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition border ${
                  selectedCategoryId === cat.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Dense 5-Column Touch Grid of Products (Matching Reference Design) */}
        <div className="flex-1 overflow-y-auto pr-1">
          {filteredProducts.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              <Package className="w-12 h-12 mb-2 opacity-30 text-slate-500" />
              <p className="font-bold text-sm text-slate-600 dark:text-slate-300">No products found</p>
              <p className="text-xs text-slate-400 mt-1">Try another search or category</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map(product => {
                const inStock = product.stock_quantity > 0;
                const isCritical = product.stock_quantity <= 2;
                const isLow = product.stock_quantity <= (product.min_stock_level || 5);
                const wasJustAdded = justAddedProductId === product.id;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleProductSelect(product)}
                    className={`relative p-3.5 rounded-2xl bg-white dark:bg-slate-900 border transition flex flex-col justify-between items-center text-center h-28 sm:h-32 shadow-sm group active:scale-95 ${
                      wasJustAdded
                        ? 'ring-2 ring-emerald-500 border-emerald-500'
                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:shadow-md'
                    }`}
                  >
                    {/* Centered Product Name */}
                    <div className="flex-1 flex flex-col items-center justify-center w-full px-1">
                      <h4 className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition line-clamp-2 leading-tight">
                        {product.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {formatMoney(product.selling_price)}
                      </p>
                    </div>

                    {/* Stock Pill Badge (Green/Yellow/Red matching inspiration) */}
                    <div className="mt-auto">
                      <span
                        className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold font-mono transition ${
                          !inStock || isCritical
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                            : isLow
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                        }`}
                      >
                        {product.stock_quantity}
                      </span>
                    </div>

                    {/* Just added feedback checkmark */}
                    {wasJustAdded && (
                      <span className="absolute top-2 right-2 text-emerald-500 animate-in zoom-in-50">
                        <CheckCircle className="w-4 h-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Dialogs */}
      {isReprintOpen && <ReprintModal onClose={() => setIsReprintOpen(false)} />}
    </div>
  );
};
