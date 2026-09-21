import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Scan,
  Plus,
  Minus,
  X,
  Trash2,
  CreditCard,
  ChevronDown,
  Printer,
  Package,
  CheckCircle,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { productRepository } from '../../db';
import { Product } from '../../types';
import { calculateCartTotals } from '../../utils/money';
import { useBarcodeScanner } from '../../services/barcodeService';
import { ReprintModal } from '../pos/ReprintModal';

// Dedicated currency & number formatters for Ugandan Shillings (UGX)
const formatPosPrice = (val: number) =>
  `UGX ${(val || 0).toLocaleString('en-US')}`;

const formatTotalNumber = (val: number) =>
  (val || 0).toLocaleString('en-US');

// Stock badge styling matching reference image colors:
// > 12: Mint green (#a7f3d0)
// 9-12: Warm amber (#fde68a)
// < 9: Soft red (#fecaca)
const getStockBadgeStyle = (qty: number) => {
  if (qty > 12) {
    return 'bg-[#a7f3d0] text-[#065f46]';
  } else if (qty >= 9) {
    return 'bg-[#fde68a] text-[#92400e]';
  } else {
    return 'bg-[#fecaca] text-[#991b1b]';
  }
};

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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isReprintOpen, setIsReprintOpen] = useState<boolean>(false);
  const [isDiscountPopoverOpen, setIsDiscountPopoverOpen] = useState<boolean>(false);
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('');
  const [justAddedProductId, setJustAddedProductId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    const allProducts = await productRepository.getActiveProducts();
    setProducts(allProducts);
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

  // Filter products by search query
  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;

    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q)
    );
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
    searchInputRef.current?.setAttribute('placeholder', 'Scanner active: enter barcode...');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f4f5f8] select-none text-slate-800">
      {/* Custom Purple Scrollbar Style for the Cart matching photo */}
      <style>{`
        .pos-cart-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .pos-cart-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .pos-cart-scrollbar::-webkit-scrollbar-thumb {
          background-color: #818cf8;
          border-radius: 9999px;
        }
      `}</style>

      {/* Mobile Responsive Segmented Tab Control (< lg) */}
      <div className="lg:hidden flex items-center p-1 bg-slate-100 border-b border-slate-200 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            mobileTab === 'catalog'
              ? 'bg-[#5c4be2] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Catalog ({products.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            mobileTab === 'cart'
              ? 'bg-[#5c4be2] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Cart ({cartItems.length}) &bull; {formatPosPrice(totals.grandTotal)}</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
        {/* =================================================================== */}
        {/* LEFT COLUMN: Cart, Customer & Checkout Panel (Matching Reference)  */}
        {/* =================================================================== */}
        <div
          className={`w-full lg:w-[410px] xl:w-[430px] 2xl:w-[460px] flex-col h-full bg-white border-r border-slate-200 relative z-10 shrink-0 ${
            mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Row 1: Customer Dropdown & Square Purple Plus Button */}
          <div className="p-3 border-b border-slate-200/80 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveWorkflowStep(9);
                proceedToCustomer();
              }}
              className="flex-1 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-between text-xs font-semibold text-slate-800 transition shadow-2xs"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="truncate">
                  {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
                </span>
                {selectedCustomer && (
                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-[#5c4be2] text-[10px] font-bold">
                    {selectedCustomer.loyalty_points} pts
                  </span>
                )}
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {/* Quick Add Customer Square Purple Button (+) */}
            <button
              type="button"
              onClick={() => {
                setActiveWorkflowStep(9);
                proceedToCustomer();
              }}
              title="Add New Customer"
              className="w-9 h-9 rounded-lg bg-[#5c4be2] hover:bg-[#503fe0] active:scale-95 text-white flex items-center justify-center font-bold transition shadow-2xs shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Row 2: Secondary POS Action Buttons (Right-aligned Purple + Orange) */}
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-end gap-2 bg-white">
            {/* Issue Loyalty Card (Purple) */}
            <button
              type="button"
              onClick={() => setIssueLoyaltyCardOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#5c4be2] hover:bg-[#503fe0] text-white text-xs font-semibold flex items-center gap-1 transition shadow-2xs active:scale-95 cursor-pointer"
            >
              <span>Issue Loyalty Card</span>
            </button>

            {/* Suspend Sales (Orange/Amber) */}
            <button
              type="button"
              disabled={cartItems.length === 0}
              onClick={() => {
                if (cartItems.length > 0) {
                  suspendCurrentSale();
                }
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#f59e0b] hover:bg-[#e08f0a] disabled:opacity-40 disabled:hover:bg-[#f59e0b] text-white text-xs font-semibold flex items-center gap-1 transition shadow-2xs active:scale-95 cursor-pointer"
            >
              <span>Suspend Sales</span>
            </button>

            {/* Receipts / Reprint */}
            <button
              type="button"
              onClick={() => setIsReprintOpen(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Receipts & Reprints"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Row 3: Itemized Cart Table with Purple Scrollbar */}
          <div
            className="flex-1 overflow-y-auto relative pos-cart-scrollbar"
            style={{ scrollbarColor: '#818cf8 transparent', scrollbarWidth: 'thin' }}
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-white border-b border-slate-100 text-slate-500 font-medium z-10">
                <tr>
                  <th className="py-2 px-3.5 text-left font-medium">Items</th>
                  <th className="py-2 px-2 text-right font-medium">Price</th>
                  <th className="py-2 px-2 text-center font-medium">Qty</th>
                  <th className="py-2 px-2 text-right font-medium">Subtotal</th>
                  <th className="py-2 px-3 text-center w-8">
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
              <tbody className="divide-y divide-slate-100">
                {cartItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-slate-400">
                      <Package className="w-9 h-9 mx-auto mb-2 opacity-30 text-slate-400" />
                      <p className="font-semibold text-xs text-slate-600">Cart is empty</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Select or scan products from the catalog
                      </p>
                    </td>
                  </tr>
                ) : (
                  cartItems.map(item => (
                    <tr
                      key={item.product.id}
                      className="hover:bg-slate-50/70 transition group text-xs"
                    >
                      {/* Item Name */}
                      <td className="py-2.5 px-3.5 text-left text-slate-800 font-normal">
                        <span className="line-clamp-1">{item.product.name}</span>
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-2 text-right font-mono text-slate-600 whitespace-nowrap">
                        {formatPosPrice(item.unit_price)}
                      </td>

                      {/* Quantity Stepper Box */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <div className="inline-flex items-center border border-slate-200 rounded-md overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(item.product.id, item.quantity - 1)}
                            className="w-5 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition"
                            title="Decrease quantity"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="w-6 text-center font-medium text-xs text-slate-800">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(item.product.id, item.quantity + 1)}
                            className="w-5 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition"
                            title="Increase quantity"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </td>

                      {/* Subtotal */}
                      <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {formatPosPrice(item.item_total)}
                      </td>

                      {/* Remove Row */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.product.id)}
                          className="text-slate-300 hover:text-rose-500 p-0.5 rounded transition"
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

          {/* Row 4: Bottom Financial Summary & Tall Payment Button */}
          <div className="border-t border-slate-200 p-3.5 sm:p-4 bg-white flex flex-col gap-2 shrink-0">
            {/* Discount & VAT breakdown */}
            <div className="flex items-center justify-end gap-6 text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setIsDiscountPopoverOpen(!isDiscountPopoverOpen)}
                className="flex items-center gap-1 hover:text-[#5c4be2] transition"
              >
                <Tag className="w-3 h-3 text-slate-400" />
                <span>
                  Discount: <strong className="text-slate-800 font-mono">{formatPosPrice(totals.totalDiscount)}</strong>
                </span>
              </button>
              <div>
                VAT: <strong className="text-slate-800 font-mono">{formatPosPrice(totals.taxTotal)}</strong>
              </div>
            </div>

            {/* Discount adjust popover */}
            {isDiscountPopoverOpen && (
              <form onSubmit={handleApplyDiscount} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl shadow-md">
                <span className="text-[11px] font-semibold text-slate-600">Cart Discount %:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercentInput}
                  onChange={e => setDiscountPercentInput(e.target.value)}
                  placeholder="10"
                  className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-[#5c4be2] hover:bg-[#503fe0] text-white rounded-lg text-xs font-bold"
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

            {/* Main Checkout Bar: Total on left, Tall Purple Button on right */}
            <div className="flex items-center justify-between gap-4 pt-1">
              {/* Total Block */}
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-slate-400">Total</span>
                <div className="flex items-baseline gap-1 text-slate-900">
                  <span className="text-xs font-bold text-slate-600">UGX</span>
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono">
                    {formatTotalNumber(totals.grandTotal)}
                  </span>
                </div>
              </div>

              {/* Prominent Vertical Tall Purple Payment Button (Exact Match to Inspiration) */}
              <button
                type="button"
                disabled={cartItems.length === 0}
                onClick={() => {
                  setActiveWorkflowStep(10);
                  proceedToPayment();
                }}
                className="w-24 sm:w-28 h-16 sm:h-18 py-2 px-3 rounded-xl bg-[#5c4be2] hover:bg-[#503fe0] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white flex flex-col items-center justify-center gap-1 shadow-md shadow-[#5c4be2]/25 transition shrink-0 cursor-pointer"
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs font-bold tracking-wide">Payment</span>
              </button>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN: Search Bar & 5-Column Product Grid                    */}
        {/* =================================================================== */}
        <div
          className={`flex-1 flex-col h-full overflow-hidden bg-[#f4f5f8] p-3 sm:p-4 gap-3 ${
            mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Top Search Bar with Search Left and Scan Right */}
          <div className="relative flex items-center shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
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
              placeholder="Search products..."
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-[#5c4be2] focus:ring-1 focus:ring-[#5c4be2]/20 transition"
            />
            <button
              type="button"
              onClick={handleTriggerScanner}
              title="Scan Barcode with Camera / Scanner"
              className="absolute right-3 p-1 text-slate-400 hover:text-[#5c4be2] transition"
            >
              <Scan className="w-4 h-4" />
            </button>
          </div>

          {/* 5-Column Responsive Touch Grid of Products */}
          <div className="flex-1 overflow-y-auto pr-1">
            {products.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-2xs p-6">
                <Package className="w-10 h-10 mb-2 opacity-30 text-slate-400" />
                <p className="font-bold text-xs text-slate-600">No products in catalog</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Add products in Inventory to start ringing up sales</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                <Package className="w-10 h-10 mb-2 opacity-30 text-slate-400" />
                <p className="font-bold text-xs text-slate-600">No products found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different name or barcode</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-2.5">
                {filteredProducts.map(product => {
                  const wasJustAdded = justAddedProductId === product.id;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductSelect(product)}
                      className={`relative p-2.5 rounded-xl bg-white border transition flex flex-col justify-between items-center text-center aspect-square sm:aspect-auto min-h-[92px] max-h-[110px] shadow-2xs group active:scale-95 cursor-pointer ${
                        wasJustAdded
                          ? 'ring-2 ring-emerald-500 border-emerald-500'
                          : 'border-slate-200/90 hover:border-[#5c4be2] hover:shadow-xs'
                      }`}
                    >
                      {/* Centered Product Name (No price, exactly matching inspiration) */}
                      <div className="flex-1 flex items-center justify-center w-full px-1">
                        <h4 className="text-xs font-medium text-slate-800 group-hover:text-[#5c4be2] transition line-clamp-2 leading-snug">
                          {product.name}
                        </h4>
                      </div>

                      {/* Stock Pill Badge at Bottom */}
                      <div className="mt-auto">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono leading-none transition ${getStockBadgeStyle(
                            product.stock_quantity
                          )}`}
                        >
                          {product.stock_quantity}
                        </span>
                      </div>

                      {/* Just added feedback checkmark */}
                      {wasJustAdded && (
                        <span className="absolute top-1.5 right-1.5 text-emerald-500 animate-in zoom-in-50">
                          <CheckCircle className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile Floating Bottom Summary Pill (< lg when items in cart) */}
          {cartItems.length > 0 && (
            <div className="lg:hidden p-3 bg-white border border-slate-200 shrink-0 flex items-center justify-between rounded-xl shadow-lg mt-auto">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in cart
                </p>
                <p className="text-base font-extrabold text-slate-900 font-mono">
                  {formatPosPrice(totals.grandTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileTab('cart')}
                className="px-4 py-2.5 bg-[#5c4be2] hover:bg-[#503fe0] active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-[#5c4be2]/30 flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>Review Cart & Pay</span>
                <CreditCard className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Dialogs */}
      {isReprintOpen && <ReprintModal onClose={() => setIsReprintOpen(false)} />}
    </div>
  );
};
