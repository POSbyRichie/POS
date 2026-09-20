import React, { useState } from 'react';
import {
  PlusCircle,
  Barcode,
  Search,
  ShoppingCart,
  User,
  CreditCard,
  Printer,
  Sparkles,
} from 'lucide-react';
import { ProductCatalog } from '../pos/ProductCatalog';
import { CartReview } from '../pos/CartReview';
import { ReprintModal } from '../pos/ReprintModal';
import { usePos } from '../../store/posStore';
import { formatMoney } from '../../utils/money';

export type SalesActiveSubTab =
  | 'new_sale'
  | 'scan'
  | 'search'
  | 'cart'
  | 'customer'
  | 'payment'
  | 'receipt';

export const SalesView: React.FC = () => {
  const {
    cartItems,
    selectedCustomer,
    startNewSale,
    proceedToPayment,
    proceedToCustomer,
    proceedToReviewCart,
  } = usePos();

  const [activeSubTab, setActiveSubTab] = useState<SalesActiveSubTab>('new_sale');
  const [isReprintOpen, setIsReprintOpen] = useState<boolean>(false);

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((acc, item) => acc + item.item_total, 0);

  const handleSubTabClick = (tab: SalesActiveSubTab) => {
    setActiveSubTab(tab);
    if (tab === 'new_sale') {
      startNewSale();
    } else if (tab === 'cart') {
      proceedToReviewCart();
    } else if (tab === 'customer') {
      proceedToCustomer();
    } else if (tab === 'payment') {
      proceedToPayment();
    } else if (tab === 'receipt') {
      setIsReprintOpen(true);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-6.5rem)] overflow-hidden gap-2">
      {/* Authoritative Sub-Navigation Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between shadow-sm shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs font-semibold">
          {/* 1. New Sale */}
          <button
            type="button"
            onClick={() => handleSubTabClick('new_sale')}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Sale</span>
          </button>

          {/* 2. Scan Product */}
          <button
            type="button"
            onClick={() => handleSubTabClick('scan')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeSubTab === 'scan'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Barcode className="w-3.5 h-3.5 text-sky-400" />
            <span>Scan Product</span>
          </button>

          {/* 3. Search Product */}
          <button
            type="button"
            onClick={() => handleSubTabClick('search')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeSubTab === 'search'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Search className="w-3.5 h-3.5 text-amber-400" />
            <span>Search Product</span>
          </button>

          {/* 4. Cart */}
          <button
            type="button"
            onClick={() => handleSubTabClick('cart')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeSubTab === 'cart'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 text-indigo-400" />
            <span>Cart</span>
            {cartCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-sky-500 text-white text-[10px] font-bold">
                {cartCount}
              </span>
            )}
          </button>

          {/* 5. Customer */}
          <button
            type="button"
            onClick={() => handleSubTabClick('customer')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              activeSubTab === 'customer' || selectedCustomer
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <User className="w-3.5 h-3.5 text-purple-400" />
            <span>{selectedCustomer ? selectedCustomer.name : 'Customer'}</span>
            {selectedCustomer && (
              <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 text-[10px] font-bold border border-purple-800">
                {selectedCustomer.loyalty_points} pts
              </span>
            )}
          </button>

          {/* 6. Payment */}
          <button
            type="button"
            disabled={cartCount === 0}
            onClick={() => handleSubTabClick('payment')}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white font-bold transition shadow-sm"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Payment</span>
            {cartSubtotal > 0 && <span>({formatMoney(cartSubtotal)})</span>}
          </button>

          {/* 7. Receipt */}
          <button
            type="button"
            onClick={() => handleSubTabClick('receipt')}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Receipts</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          <span>Local IndexedDB ACID Session</span>
        </div>
      </div>

      {/* Main Retail Sales Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 h-[calc(100%-3rem)] overflow-hidden">
        {/* Left Column: Product Catalog, Scan & Search */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
          <ProductCatalog onProceedToReviewCart={() => proceedToReviewCart()} />
        </div>

        {/* Right Column: Cart, Customer & Checkout */}
        <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
          <CartReview
            onProceedToPayment={() => proceedToPayment()}
            onOpenCustomerModal={() => proceedToCustomer()}
          />
        </div>
      </div>

      {/* Reprint / Receipts Modal */}
      {isReprintOpen && <ReprintModal onClose={() => setIsReprintOpen(false)} />}
    </div>
  );
};
