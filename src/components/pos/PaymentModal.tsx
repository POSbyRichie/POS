import React, { useState } from 'react';
import {
  CreditCard,
  Banknote,
  Smartphone,
  QrCode,
  Split,
  CheckCircle,
  AlertTriangle,
  X,
  RefreshCw,
  Trash2,
  Plus,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { PaymentMethod, PaymentBreakdown } from '../../types';
import { calculateCartTotals, calculatePaymentBreakdown, formatMoney, parseToMinorUnits } from '../../utils/money';
import { saleService } from '../../services/saleService';

interface PaymentModalProps {
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, onPaymentSuccess }) => {
  const {
    cartItems,
    selectedCustomer,
    cartDiscountPercent,
    cartDiscountFixed,
    activeShift,
    activeRegister,
    currentUser,
    setLastCompletedSaleResult,
    setActiveWorkflowStep,
  } = usePos();

  const totals = calculateCartTotals(cartItems, cartDiscountPercent, cartDiscountFixed);

  const [activeMethod, setActiveMethod] = useState<PaymentMethod>('cash');
  const [payments, setPayments] = useState<PaymentBreakdown[]>([]);
  const [currentTenderInput, setCurrentTenderInput] = useState<string>('');
  const [referenceInput, setReferenceInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [paymentFailed, setPaymentFailed] = useState<boolean>(false);
  const [failureMessage, setFailureMessage] = useState<string>('');

  const breakdown = calculatePaymentBreakdown(totals.grandTotal, payments);

  const handleAddPayment = () => {
    const enteredAmount = parseToMinorUnits(
      currentTenderInput || (breakdown.remainingDue > 0 ? breakdown.remainingDue : totals.grandTotal),
      0
    );

    if (enteredAmount <= 0) return;

    const newPayment: PaymentBreakdown = {
      id: Math.random().toString(36).slice(2, 9),
      method: activeMethod,
      amount_paid: enteredAmount,
      reference: referenceInput.trim() || undefined,
    };

    setPayments(prev => [...prev, newPayment]);
    setCurrentTenderInput('');
    setReferenceInput('');
    setPaymentFailed(false);
  };

  const handleRemovePayment = (id: string) => {
    setPayments(prev => prev.filter(p => p.id !== id));
  };

  /**
   * Authoritative Step 11: Execute Payment & Check If Successful
   */
  const handleExecutePayment = async () => {
    if (!activeShift || !currentUser || !activeRegister) {
      setPaymentFailed(true);
      setFailureMessage('Active shift and cashier credentials required.');
      return;
    }

    if (!breakdown.isFullyPaid) {
      setPaymentFailed(true);
      setFailureMessage(`Amount paid (${formatMoney(breakdown.totalPaid)}) is less than total due (${formatMoney(breakdown.totalDue)}).`);
      return;
    }

    setIsProcessing(true);
    setPaymentFailed(false);

    try {
      // Execute authoritative Steps 10 -> 16
      const result = await saleService.completeSale({
        items: cartItems,
        cartDiscountPercent,
        cartDiscountFixed,
        payments,
        customer: selectedCustomer,
        shift: activeShift,
        registerId: activeRegister.id,
        cashierId: currentUser.id,
      });

      // Step 11: YES -> Continue to receipt (Step 12)
      setLastCompletedSaleResult(result);
      setActiveWorkflowStep(12);
      onPaymentSuccess();
    } catch (err: any) {
      // Step 11: NO -> Unsuccessful decision
      setPaymentFailed(true);
      setFailureMessage(err.message || 'Payment processing could not be completed.');
      setActiveWorkflowStep(11);
    } finally {
      setIsProcessing(false);
    }
  };

  const quickTenderOptions = [
    { label: 'Exact Total', value: breakdown.remainingDue },
    { label: '20,000', value: 20000 },
    { label: '50,000', value: 50000 },
    { label: '100,000', value: 100000 },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col md:flex-row">
        {/* Left Column: Method Selector & Tender Entry */}
        <div className="w-full md:w-7/12 p-5 border-b md:border-b-0 md:border-r border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>10. PAYMENT METHOD</span>
              </h3>
              <p className="text-xs text-slate-400">Select tender &amp; record transactions</p>
            </div>
          </div>

          {/* Payment Method Tabs */}
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setActiveMethod('cash')}
              className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 text-xs font-bold ${
                activeMethod === 'cash'
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Banknote className="w-4 h-4" />
              <span>Cash</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMethod('card')}
              className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 text-xs font-bold ${
                activeMethod === 'card'
                  ? 'bg-sky-950/80 border-sky-500 text-sky-200 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Card</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMethod('wallet')}
              className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 text-xs font-bold ${
                activeMethod === 'wallet'
                  ? 'bg-purple-950/80 border-purple-500 text-purple-200 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Wallet</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMethod('qr')}
              className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 text-xs font-bold ${
                activeMethod === 'qr'
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
            </button>
          </div>

          {/* Tender Amount Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Amount Tendered ({activeMethod.toUpperCase()})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                UGX
              </span>
              <input
                type="number"
                min="0"
                step="100"
                value={currentTenderInput}
                onChange={e => setCurrentTenderInput(e.target.value)}
                placeholder={String(breakdown.remainingDue > 0 ? breakdown.remainingDue : totals.grandTotal)}
                className="w-full pl-14 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-lg font-bold text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Preset Buttons for Cash */}
          {activeMethod === 'cash' && (
            <div className="flex flex-wrap gap-1.5">
              {quickTenderOptions.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentTenderInput(String(opt.value))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono text-slate-200 transition"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Reference input for Card/Wallet/QR */}
          {activeMethod !== 'cash' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Transaction Reference / Auth Code *
              </label>
              <input
                type="text"
                value={referenceInput}
                onChange={e => setReferenceInput(e.target.value)}
                placeholder={activeMethod === 'card' ? 'e.g. AUTH-987654' : 'e.g. TXN-MM-123456'}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Security: Never enter full card numbers or PINs. Only store reference metadata.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleAddPayment}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add {activeMethod.toUpperCase()} Tender to Split
          </button>
        </div>

        {/* Right Column: Ledger, Balance & Decision Step 11 */}
        <div className="w-full md:w-5/12 bg-slate-950/60 p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-400">Total Amount Due</span>
              <span className="text-lg font-black text-white font-mono">{formatMoney(totals.grandTotal)}</span>
            </div>

            {/* Split payments breakdown list */}
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Tender Breakdown
              </span>
              {payments.length === 0 ? (
                <p className="text-xs text-slate-600 italic">No tenders added yet.</p>
              ) : (
                payments.map(p => (
                  <div
                    key={p.id}
                    className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-200 uppercase">{p.method}</span>
                      {p.reference && (
                        <span className="text-[10px] text-slate-500 font-mono block">Ref: {p.reference}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400 font-bold">{formatMoney(p.amount_paid)}</span>
                      <button
                        onClick={() => handleRemovePayment(p.id)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Balances */}
            <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Total Paid:</span>
                <span className="font-mono text-white font-bold">{formatMoney(breakdown.totalPaid)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Remaining Due:</span>
                <span
                  className={`font-mono font-bold ${
                    breakdown.remainingDue > 0 ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  {formatMoney(breakdown.remainingDue)}
                </span>
              </div>
              {breakdown.change > 0 && (
                <div className="flex justify-between text-emerald-400 pt-1 border-t border-slate-800/80 font-bold">
                  <span>Change to Give:</span>
                  <span className="font-mono text-base">{formatMoney(breakdown.change)}</span>
                </div>
              )}
            </div>

            {/* Step 11 Decision: Payment Unsuccessful Display */}
            {paymentFailed && (
              <div className="mt-3 p-3 bg-rose-950/80 border border-rose-800 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-rose-300 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>11. PAYMENT UNSUCCESSFUL</span>
                </div>
                <p className="text-[11px] text-rose-400">{failureMessage}</p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleExecutePayment()}
                    className="px-2.5 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] font-bold"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => setPaymentFailed(false)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px]"
                  >
                    Change Method
                  </button>
                  <button
                    onClick={onClose}
                    className="px-2.5 py-1 text-slate-400 hover:text-white text-[11px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {/* Step 11 Decision: Complete Sale (Yes -> Continue to receipt) */}
            <button
              disabled={isProcessing || !breakdown.isFullyPaid}
              onClick={handleExecutePayment}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {isProcessing ? 'Processing Transaction...' : 'COMPLETE SALE (STEP 11 YES)'}
            </button>

            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition"
            >
              Back to Cart (Cart is Preserved)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
