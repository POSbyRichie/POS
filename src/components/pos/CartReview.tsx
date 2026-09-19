import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  Tag,
  FileText,
  User,
  CreditCard,
  Percent,
  DollarSign,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { calculateCartTotals, formatMoney } from '../../utils/money';
import { CartItem } from '../../types';

interface CartReviewProps {
  onProceedToPayment: () => void;
  onOpenCustomerModal: () => void;
}

export const CartReview: React.FC<CartReviewProps> = ({
  onProceedToPayment,
  onOpenCustomerModal,
}) => {
  const {
    cartItems,
    selectedCustomer,
    cartDiscountPercent,
    cartDiscountFixed,
    updateCartItemQuantity,
    removeCartItem,
    updateCartItemMeta,
    setCartDiscount,
    startNewSale,
    setActiveWorkflowStep,
  } = usePos();

  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [editingDiscountIndex, setEditingDiscountIndex] = useState<number | null>(null);
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('');
  const [isCartDiscountOpen, setIsCartDiscountOpen] = useState<boolean>(false);

  const totals = calculateCartTotals(cartItems, cartDiscountPercent, cartDiscountFixed);

  const handleApplyCartDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    const percent = parseFloat(discountPercentInput) || 0;
    setCartDiscount(Math.min(100, Math.max(0, percent)), 0);
    setIsCartDiscountOpen(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-full shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>8. REVIEW CART</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-950 text-sky-400 border border-sky-800 font-mono">
              {totals.itemCount} items
            </span>
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Decimal-safe monetary calculations</p>
        </div>

        {cartItems.length > 0 && (
          <button
            onClick={() => startNewSale()}
            className="text-[11px] text-slate-400 hover:text-rose-400 transition"
            title="Clear current cart and restart sale"
          >
            Clear Cart
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-800/60">
        {cartItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <p className="text-xs font-semibold">Cart is currently empty</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Scan a barcode or click items from the catalog (Step 5) to begin.
            </p>
          </div>
        ) : (
          cartItems.map((item, index) => (
            <div key={item.product.id} className="pt-3 first:pt-0">
              <div className="flex justify-between items-start">
                <div className="flex-1 pr-2">
                  <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{item.product.name}</h4>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                    <span>{item.product.sku}</span>
                    <span>&bull;</span>
                    <span>{formatMoney(item.unit_price)} / {item.product.unit}</span>
                    {item.tax_rate > 0 && (
                      <>
                        <span>&bull;</span>
                        <span className="text-sky-400">VAT {item.tax_rate}%</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-extrabold text-white font-mono">
                    {formatMoney(item.item_total)}
                  </span>
                  {item.discount_amount > 0 && (
                    <span className="text-[10px] text-emerald-400 block font-mono">
                      -{formatMoney(item.discount_amount * item.quantity)}
                    </span>
                  )}
                </div>
              </div>

              {/* Controls: Quantity, Line Discount, Notes, Remove */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateCartItemQuantity(item.product.id, item.quantity - 1)}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition text-xs"
                    title="Decrease quantity"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold font-mono text-white">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateCartItemQuantity(item.product.id, item.quantity + 1)}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition text-xs"
                    title="Increase quantity"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Line Note */}
                  <button
                    onClick={() => setEditingNoteIndex(editingNoteIndex === index ? null : index)}
                    className={`p-1 rounded text-xs transition ${
                      item.note ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title="Add item note"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>

                  {/* Remove line */}
                  <button
                    onClick={() => removeCartItem(item.product.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Note input expandable */}
              {editingNoteIndex === index && (
                <div className="mt-2 pt-2 border-t border-slate-800/40">
                  <input
                    type="text"
                    defaultValue={item.note || ''}
                    onBlur={e => {
                      updateCartItemMeta(item.product.id, item.discount_amount, e.target.value);
                      setEditingNoteIndex(null);
                    }}
                    placeholder="Add special instructions or note..."
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    autoFocus
                  />
                </div>
              )}

              {item.note && editingNoteIndex !== index && (
                <p className="text-[10px] text-sky-400/90 italic mt-1 bg-slate-950/40 px-2 py-0.5 rounded">
                  Note: {item.note}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Customer Quick Bar (Step 9 Integration) */}
      <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
            <User className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 block">
              9. CUSTOMER
            </span>
            <span className="text-xs font-bold text-slate-200">
              {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
            </span>
          </div>
        </div>

        <button
          onClick={onOpenCustomerModal}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 font-semibold rounded-lg text-[11px] transition border border-slate-700"
        >
          {selectedCustomer ? 'Change Customer' : '+ Select / Add Customer'}
        </button>
      </div>

      {/* Cart Financial Summary (Step 8 Calculations) */}
      <div className="p-4 bg-slate-950/90 border-t border-slate-800 space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Subtotal</span>
          <span className="font-mono text-slate-200">{formatMoney(totals.subtotal)}</span>
        </div>

        {totals.totalDiscount > 0 && (
          <div className="flex justify-between text-xs text-emerald-400">
            <span>Discounts Applied</span>
            <span className="font-mono">-{formatMoney(totals.totalDiscount)}</span>
          </div>
        )}

        <div className="flex justify-between text-xs text-slate-400">
          <span>Tax (VAT)</span>
          <span className="font-mono text-slate-200">{formatMoney(totals.taxTotal)}</span>
        </div>

        {/* Cart discount action */}
        <div className="pt-1 flex items-center justify-between">
          <button
            onClick={() => setIsCartDiscountOpen(!isCartDiscountOpen)}
            className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold"
          >
            <Tag className="w-3 h-3" />
            {cartDiscountPercent > 0 ? `Discount: ${cartDiscountPercent}%` : '+ Apply Cart Discount'}
          </button>
        </div>

        {isCartDiscountOpen && (
          <form onSubmit={handleApplyCartDiscount} className="flex gap-2 pt-1">
            <input
              type="number"
              min="0"
              max="100"
              value={discountPercentInput}
              onChange={e => setDiscountPercentInput(e.target.value)}
              placeholder="e.g. 10%"
              className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold"
            >
              Apply %
            </button>
            {cartDiscountPercent > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCartDiscount(0, 0);
                  setIsCartDiscountOpen(false);
                }}
                className="px-2 py-1 bg-slate-800 text-rose-400 rounded-lg text-xs"
              >
                Clear
              </button>
            )}
          </form>
        )}

        {/* Grand Total */}
        <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
          <div>
            <span className="text-xs font-extrabold text-slate-300 block">TOTAL AMOUNT</span>
            <span className="text-[10px] text-slate-500">Includes all taxes &amp; discounts</span>
          </div>
          <span className="text-xl font-black text-emerald-400 font-mono">
            {formatMoney(totals.grandTotal)}
          </span>
        </div>

        {/* Proceed to Checkout CTA */}
        <button
          disabled={cartItems.length === 0}
          onClick={() => {
            setActiveWorkflowStep(10); // Move to Step 10: Payment
            onProceedToPayment();
          }}
          className="w-full mt-2 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
        >
          <CreditCard className="w-4 h-4" />
          PROCEED TO PAYMENT (STEP 10)
        </button>
      </div>
    </div>
  );
};
