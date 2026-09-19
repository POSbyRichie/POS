import React, { useState } from 'react';
import {
  Printer,
  Mail,
  MessageSquare,
  CheckCircle,
  X,
  ArrowRight,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { printService } from '../../services/printService';
import { formatMoney, DEFAULT_STORE_INFO } from '../../utils/money';

interface ReceiptModalProps {
  onClose: () => void;
  onProceedToCompleted: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ onClose, onProceedToCompleted }) => {
  const { lastCompletedSaleResult, activeRegister, currentUser } = usePos();
  const [emailInput, setEmailInput] = useState<string>('');
  const [smsInput, setSmsInput] = useState<string>('');
  const [emailQueued, setEmailQueued] = useState<boolean>(false);
  const [smsQueued, setSmsQueued] = useState<boolean>(false);

  if (!lastCompletedSaleResult) return null;

  const { sale, items, payments, loyaltyTransaction, newCustomerPoints } = lastCompletedSaleResult;

  const handlePrint = () => {
    printService.printReceipt();
  };

  const handleQueueEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setEmailQueued(true);
  };

  const handleQueueSms = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsInput) return;
    setSmsQueued(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col md:flex-row">
        {/* Left Column: Actions (Print, Email, SMS, Next) */}
        <div className="w-full md:w-5/12 p-6 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <Printer className="w-5 h-5 text-sky-400" />
                <span>12. RECEIPT OPTIONS</span>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Print, queue digital receipt, or continue to sale completion</p>

            {/* Primary Action: Print Receipt */}
            <button
              onClick={handlePrint}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 mb-3"
            >
              <Printer className="w-4 h-4" />
              PRINT THERMAL RECEIPT
            </button>

            {/* Email Queue */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Mail className="w-3.5 h-3.5 text-sky-400" />
                <span>Email Digital Receipt</span>
              </div>
              {!emailQueued ? (
                <form onSubmit={handleQueueEmail} className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="customer@email.com"
                    className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                  >
                    Queue
                  </button>
                </form>
              ) : (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle className="w-3 h-3" /> Queued for dispatch on sync!
                </p>
              )}
            </div>

            {/* SMS Queue */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                <span>SMS Receipt (Phone)</span>
              </div>
              {!smsQueued ? (
                <form onSubmit={handleQueueSms} className="flex gap-2">
                  <input
                    type="tel"
                    value={smsInput}
                    onChange={e => setSmsInput(e.target.value)}
                    placeholder="+256 700 000000"
                    className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                  >
                    Queue
                  </button>
                </form>
              ) : (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle className="w-3 h-3" /> Queued for SMS delivery!
                </p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-2">
            {/* Step 16 Transition Button */}
            <button
              onClick={onProceedToCompleted}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <span>SALE COMPLETED &amp; NEXT CUSTOMER (STEP 16)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Thermal Paper Preview */}
        <div className="w-full md:w-7/12 bg-slate-950 p-6 flex flex-col items-center justify-center">
          <div
            id="printable-receipt"
            className="w-full max-w-xs bg-white text-slate-900 p-5 rounded-lg shadow-2xl font-mono text-[11px] leading-tight select-text"
          >
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-400">
              <h4 className="font-extrabold text-sm uppercase tracking-wide">{DEFAULT_STORE_INFO.name}</h4>
              <p className="text-[10px] text-slate-600">{DEFAULT_STORE_INFO.tagline}</p>
              <p className="text-[10px] text-slate-600 mt-1">{DEFAULT_STORE_INFO.address}</p>
              <p className="text-[10px] text-slate-600">TEL: {DEFAULT_STORE_INFO.phone}</p>
              <p className="text-[10px] text-slate-600">TAX ID: {DEFAULT_STORE_INFO.tax_id}</p>
            </div>

            {/* Receipt Meta */}
            <div className="py-2.5 border-b border-dashed border-slate-400 text-[10px] space-y-0.5">
              <div className="flex justify-between font-bold">
                <span>RECEIPT:</span>
                <span>{sale.receipt_number}</span>
              </div>
              <div className="flex justify-between">
                <span>DATE:</span>
                <span>{new Date(sale.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>TERMINAL:</span>
                <span>{activeRegister?.register_name}</span>
              </div>
              <div className="flex justify-between">
                <span>CASHIER:</span>
                <span>{currentUser?.full_name}</span>
              </div>
              {newCustomerPoints !== undefined && (
                <div className="flex justify-between text-emerald-800 font-bold pt-0.5">
                  <span>LOYALTY POINTS:</span>
                  <span>{newCustomerPoints} pts (+{loyaltyTransaction?.points_delta || 0})</span>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1.5">
              <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-slate-300">
                <span>ITEM / QTY</span>
                <span>TOTAL</span>
              </div>
              {items.map(item => (
                <div key={item.id} className="space-y-0.5">
                  <span className="font-bold block truncate">{item.product_name}</span>
                  <div className="flex justify-between text-slate-600 text-[10px]">
                    <span>
                      {item.quantity} x {formatMoney(item.unit_price)}
                    </span>
                    <span className="font-bold text-slate-900">{formatMoney(item.total_price)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Breakdown */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>{formatMoney(sale.subtotal)}</span>
              </div>
              {sale.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>DISCOUNTS:</span>
                  <span>-{formatMoney(sale.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>TAX (VAT):</span>
                <span>{formatMoney(sale.tax_amount)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-xs pt-1 border-t border-slate-400">
                <span>TOTAL DUE:</span>
                <span>{formatMoney(sale.total_amount)}</span>
              </div>
            </div>

            {/* Payments & Change */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
              {payments.map(p => (
                <div key={p.id} className="flex justify-between">
                  <span className="uppercase">PAID ({p.method}):</span>
                  <span className="font-bold">{formatMoney(p.amount_paid)}</span>
                </div>
              ))}
              {sale.change_amount > 0 && (
                <div className="flex justify-between font-bold pt-0.5">
                  <span>CHANGE GIVEN:</span>
                  <span>{formatMoney(sale.change_amount)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center pt-3 text-[9px] text-slate-600 space-y-1">
              <p className="font-bold uppercase tracking-wider">THANK YOU FOR SHOPPING WITH US!</p>
              <p>PLEASE RETAIN YOUR RECEIPT</p>
              <p className="font-mono text-[8px] mt-1 text-slate-400">UUID: {sale.id}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
