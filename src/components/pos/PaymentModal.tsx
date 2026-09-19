import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Banknote,
  Smartphone,
  QrCode,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Plus,
  RefreshCw,
  X,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { PaymentMethod } from '../../types';
import { calculateCartTotals, formatMoney, parseToMinorUnits } from '../../utils/money';
import {
  paymentEngine,
  TenderLineItem,
  PaymentDecisionState,
} from '../../payment';

interface PaymentModalProps {
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, onPaymentSuccess }) => {
  const {
    currentSaleId,
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

  // Active Method & Form State
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>('cash');
  const [tenders, setTenders] = useState<TenderLineItem[]>([]);
  const [currentTenderInput, setCurrentTenderInput] = useState<string>('');
  const [referenceInput, setReferenceInput] = useState<string>('');
  const [walletCarrier, setWalletCarrier] = useState<'mtn_momo' | 'airtel_money'>('mtn_momo');
  const [cardBrand, setCardBrand] = useState<'visa' | 'mastercard' | 'local_debit'>('visa');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copiedQr, setCopiedQr] = useState<boolean>(false);

  // Decision Handler State
  const [decisionState, setDecisionState] = useState<PaymentDecisionState>(
    paymentEngine.decisionHandler.getState()
  );

  useEffect(() => {
    paymentEngine.decisionHandler.reset(activeMethod);
    return paymentEngine.decisionHandler.subscribe(newState => setDecisionState(newState));
  }, [activeMethod]);

  // Compute Balances
  const totalPaid = tenders.reduce((acc, t) => acc + (t.amount || 0), 0);
  const remainingDue = Math.max(0, totals.grandTotal - totalPaid);
  const changeDue = Math.max(0, totalPaid - totals.grandTotal);
  const isFullyPaid = totalPaid >= totals.grandTotal && totals.grandTotal > 0;

  // Add Tender Line to Split Ledger
  const handleAddTender = () => {
    const enteredAmount = parseToMinorUnits(
      currentTenderInput || (remainingDue > 0 ? remainingDue : totals.grandTotal),
      0
    );

    if (enteredAmount <= 0) return;

    let ref = referenceInput.trim();
    if (!ref && activeMethod === 'card') {
      ref = `AUTH-${Date.now().toString().slice(-6)}`;
    } else if (!ref && activeMethod === 'wallet') {
      ref = `MM-${walletCarrier === 'mtn_momo' ? 'MTN' : 'AIR'}-${Date.now().toString().slice(-6)}`;
    } else if (!ref && activeMethod === 'qr') {
      ref = `QR-${Date.now().toString().slice(-6)}`;
    }

    const metadata: Record<string, any> = {};
    if (activeMethod === 'card') {
      metadata.authCode = ref;
      metadata.brand = cardBrand;
    } else if (activeMethod === 'wallet') {
      metadata.carrier = walletCarrier;
      metadata.phoneNumber = selectedCustomer?.phone || '+256700000000';
      metadata.transactionReference = ref;
    } else if (activeMethod === 'qr') {
      metadata.merchantId = activeRegister?.id || 'REG-01';
      metadata.transactionReference = ref;
    }

    const newTender = paymentEngine.createTender(activeMethod, enteredAmount, ref || undefined, metadata);

    setTenders(prev => [...prev, newTender]);
    setCurrentTenderInput('');
    setReferenceInput('');
    paymentEngine.decisionHandler.reset(activeMethod);
  };

  const handleRemoveTender = (id: string) => {
    setTenders(prev => prev.filter(t => t.id !== id));
  };

  /**
   * Authoritative Step 10 & 11: Execute Payment via Payment Engine
   */
  const handleExecutePayment = async () => {
    if (!activeShift || !currentUser || !activeRegister) {
      paymentEngine.decisionHandler.handleFailure({
        success: false,
        status: 'failed',
        totalDue: totals.grandTotal,
        totalPaid,
        change: 0,
        tenders,
        errorCode: 'AUTH_REQUIRED',
        errorMessage: 'Active cashier session and verified register required.',
        canRetry: true,
      });
      return;
    }

    // If no tenders added yet, create one for the full amount with the active method
    let activeTenders = [...tenders];
    if (activeTenders.length === 0) {
      const defaultAmount = totals.grandTotal;
      let ref = referenceInput.trim();
      if (!ref && activeMethod === 'card') ref = `AUTH-${Date.now().toString().slice(-6)}`;
      if (!ref && activeMethod === 'wallet') ref = `MM-${Date.now().toString().slice(-6)}`;
      if (!ref && activeMethod === 'qr') ref = `QR-${Date.now().toString().slice(-6)}`;

      const quickTender = paymentEngine.createTender(activeMethod, defaultAmount, ref || undefined);
      activeTenders = [quickTender];
      setTenders([quickTender]);
    }

    setIsProcessing(true);

    try {
      const result = await paymentEngine.processWithDecision({
        saleId: currentSaleId,
        totalDue: totals.grandTotal,
        items: cartItems,
        cartDiscountPercent,
        cartDiscountFixed,
        tenders: activeTenders,
        customer: selectedCustomer,
        shift: activeShift,
        registerId: activeRegister.id,
        cashierId: currentUser.id,
      });

      if (result.success && result.saleResult) {
        // Step 11: YES -> Proceed to Receipt (Step 12)
        setLastCompletedSaleResult(result.saleResult);
        setActiveWorkflowStep(12);
        onPaymentSuccess();
      } else {
        // Step 11: NO -> Decision state populated with Retry, Change Method, Cancel
        setActiveWorkflowStep(11);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Decision Recovery Action: RETRY
  const handleDecisionRetry = () => {
    paymentEngine.decisionHandler.actionRetry();
    handleExecutePayment();
  };

  // Decision Recovery Action: CHANGE METHOD
  const handleDecisionChangeMethod = (newMethod: PaymentMethod) => {
    paymentEngine.decisionHandler.actionChangeMethod(newMethod);
    setActiveMethod(newMethod);
    setCurrentTenderInput('');
    setReferenceInput('');
  };

  // Decision Recovery Action: CANCEL
  const handleDecisionCancel = () => {
    paymentEngine.decisionHandler.actionCancel();
    onClose();
  };

  const quickTenderOptions = [
    { label: 'Exact Total', value: remainingDue > 0 ? remainingDue : totals.grandTotal },
    { label: '20,000', value: 20000 },
    { label: '50,000', value: 50000 },
    { label: '100,000', value: 100000 },
  ];

  const generatedQrString = `POSQR|STORE:ANTIGRAVITY|TERMINAL:${activeRegister?.register_name}|AMOUNT:${
    remainingDue > 0 ? remainingDue : totals.grandTotal
  }|CUR:UGX|SALE:${currentSaleId.slice(0, 8)}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col md:flex-row">
        {/* Left Column: Method Selector & Method-Specific Forms */}
        <div className="w-full md:w-7/12 p-5 border-b md:border-b-0 md:border-r border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>10. PAYMENT ENGINE</span>
              </h3>
              <p className="text-xs text-slate-400">Select tender method or build split payment</p>
            </div>
            <button
              onClick={handleDecisionCancel}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              title="Cancel payment and return to cart"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Payment Method Selector Tabs */}
          <div className="grid grid-cols-5 gap-1.5">
            <button
              type="button"
              onClick={() => handleDecisionChangeMethod('cash')}
              className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 text-[11px] font-bold ${
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
              onClick={() => handleDecisionChangeMethod('card')}
              className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 text-[11px] font-bold ${
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
              onClick={() => handleDecisionChangeMethod('wallet')}
              className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 text-[11px] font-bold ${
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
              onClick={() => handleDecisionChangeMethod('qr')}
              className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 text-[11px] font-bold ${
                activeMethod === 'qr'
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR</span>
            </button>

            <button
              type="button"
              onClick={() => handleDecisionChangeMethod('split')}
              className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 text-[11px] font-bold ${
                activeMethod === 'split'
                  ? 'bg-teal-950/80 border-teal-500 text-teal-200 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Split</span>
            </button>
          </div>

          {/* Method-Specific Input Panels */}
          {activeMethod === 'cash' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Cash Tendered Amount
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
                  placeholder={String(remainingDue > 0 ? remainingDue : totals.grandTotal)}
                  className="w-full pl-14 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-lg font-bold text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Quick Cash Presets */}
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
            </div>
          )}

          {activeMethod === 'card' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Card Amount &amp; Terminal Auth
                </label>
                <div className="flex gap-1 text-[10px]">
                  {(['visa', 'mastercard', 'local_debit'] as const).map(brand => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => setCardBrand(brand)}
                      className={`px-2 py-0.5 rounded uppercase font-semibold ${
                        cardBrand === brand ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {brand === 'local_debit' ? 'Debit' : brand}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                  UGX
                </span>
                <input
                  type="number"
                  value={currentTenderInput}
                  onChange={e => setCurrentTenderInput(e.target.value)}
                  placeholder={String(remainingDue > 0 ? remainingDue : totals.grandTotal)}
                  className="w-full pl-14 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-base font-bold text-white focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Terminal Authorization Code *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referenceInput}
                    onChange={e => setReferenceInput(e.target.value)}
                    placeholder="e.g. AUTH-987654"
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setReferenceInput(`AUTH-${Date.now().toString().slice(-6)}`)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs rounded-xl font-mono shrink-0"
                  >
                    Auto-Gen
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMethod === 'wallet' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Mobile Money Wallet
                </label>
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setWalletCarrier('mtn_momo')}
                    className={`px-2 py-0.5 rounded font-bold ${
                      walletCarrier === 'mtn_momo'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    MTN MoMo
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletCarrier('airtel_money')}
                    className={`px-2 py-0.5 rounded font-bold ${
                      walletCarrier === 'airtel_money'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    Airtel Money
                  </button>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                  UGX
                </span>
                <input
                  type="number"
                  value={currentTenderInput}
                  onChange={e => setCurrentTenderInput(e.target.value)}
                  placeholder={String(remainingDue > 0 ? remainingDue : totals.grandTotal)}
                  className="w-full pl-14 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-base font-bold text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Customer Phone &amp; Carrier Reference *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referenceInput}
                    onChange={e => setReferenceInput(e.target.value)}
                    placeholder="e.g. TXN-MM-123456"
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReferenceInput(
                        `MM-${walletCarrier === 'mtn_momo' ? 'MTN' : 'AIR'}-${Date.now().toString().slice(-6)}`
                      )
                    }
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 text-xs rounded-xl font-mono shrink-0"
                  >
                    Simulate
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMethod === 'qr' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Merchant QR Scan
              </label>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div className="truncate pr-2">
                  <span className="text-[10px] text-slate-500 block font-mono">EMVCo Payload:</span>
                  <span className="text-[11px] text-amber-300 font-mono truncate block">
                    {generatedQrString}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedQrString);
                    setCopiedQr(true);
                    setTimeout(() => setCopiedQr(false), 2000);
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs shrink-0 flex items-center gap-1"
                  title="Copy QR payload"
                >
                  {copiedQr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedQr ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Customer Scan Verification Reference *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referenceInput}
                    onChange={e => setReferenceInput(e.target.value)}
                    placeholder="e.g. QR-TXN-887766"
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setReferenceInput(`QR-${Date.now().toString().slice(-6)}`)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs rounded-xl font-mono shrink-0"
                  >
                    Confirm Scan
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMethod === 'split' && (
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
              <span className="font-bold text-teal-300 block">Split Tender Mode Active</span>
              <p className="text-[11px] text-slate-400">
                Switch to Cash, Card, Wallet, or QR above to add individual tender lines to your split ledger.
              </p>
            </div>
          )}

          {/* Add Tender Button (for building split payments) */}
          <button
            type="button"
            onClick={handleAddTender}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add {activeMethod.toUpperCase()} Tender Line
          </button>
        </div>

        {/* Right Column: Ledger, Decision Outcome Banner (YES / NO Actions) */}
        <div className="w-full md:w-5/12 bg-slate-950/60 p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-400">Total Amount Due</span>
              <span className="text-lg font-black text-white font-mono">
                {formatMoney(totals.grandTotal)}
              </span>
            </div>

            {/* Split Tenders Ledger List */}
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Tender Breakdown ({tenders.length} lines)
              </span>
              {tenders.length === 0 ? (
                <p className="text-xs text-slate-600 italic">No tenders added yet.</p>
              ) : (
                tenders.map(t => (
                  <div
                    key={t.id}
                    className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-200 uppercase">{t.method}</span>
                      {t.reference && (
                        <span className="text-[10px] text-slate-500 font-mono block">Ref: {t.reference}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400 font-bold">{formatMoney(t.amount)}</span>
                      <button
                        onClick={() => handleRemoveTender(t.id)}
                        className="text-slate-500 hover:text-rose-400"
                        title="Remove tender"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Live Financial Balances */}
            <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Total Tendered:</span>
                <span className="font-mono text-white font-bold">{formatMoney(totalPaid)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Remaining Due:</span>
                <span
                  className={`font-mono font-bold ${
                    remainingDue > 0 ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  {formatMoney(remainingDue)}
                </span>
              </div>
              {changeDue > 0 && (
                <div className="flex justify-between text-emerald-400 pt-1 border-t border-slate-800/80 font-bold">
                  <span>Change to Give:</span>
                  <span className="font-mono text-base">{formatMoney(changeDue)}</span>
                </div>
              )}
            </div>

            {/* DECISION NODE: Successful? -> NO Display with Retry, Change Method, Cancel */}
            {decisionState.status === 'failed' && (
              <div className="mt-3 p-3.5 bg-rose-950/80 border border-rose-800 rounded-xl space-y-2 text-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-rose-300 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>DECISION: PAYMENT UNSUCCESSFUL</span>
                </div>
                <p className="text-[11px] text-rose-400 font-medium">
                  {decisionState.failureReason || 'Transaction validation failed.'}
                </p>

                {/* Explicit 3 Recovery Actions from diagram */}
                <div className="flex flex-wrap gap-2 pt-1 border-t border-rose-900/60">
                  {/* Action 1: Retry */}
                  <button
                    type="button"
                    onClick={handleDecisionRetry}
                    className="flex-1 px-2.5 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>

                  {/* Action 2: Change Method */}
                  <button
                    type="button"
                    onClick={() => handleDecisionChangeMethod(activeMethod === 'cash' ? 'card' : 'cash')}
                    className="flex-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-bold transition"
                  >
                    Change Method
                  </button>

                  {/* Action 3: Cancel */}
                  <button
                    type="button"
                    onClick={handleDecisionCancel}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-[11px] transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action CTAs */}
          <div className="space-y-2">
            {/* Primary Submit Button: Step 11 Decision Execution */}
            <button
              disabled={isProcessing || (!isFullyPaid && tenders.length > 0)}
              onClick={handleExecutePayment}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {isProcessing
                ? 'Processing Payment Engine...'
                : isFullyPaid
                ? 'COMPLETE PAYMENT (STEP 11 YES)'
                : 'SUBMIT PAYMENT (STEP 10/11)'}
            </button>

            {/* Cancel / Back to Cart */}
            <button
              type="button"
              onClick={handleDecisionCancel}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition"
            >
              Cancel Payment &amp; Back to Cart (Step 8)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
