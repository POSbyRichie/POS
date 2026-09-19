import React, { useState } from 'react';
import { Receipt, StoreInfo, Sale, SaleItem, PaymentRecord } from '../../types';
import { formatMoney, DEFAULT_STORE_INFO } from '../../utils/money';
import { Copy, Check } from 'lucide-react';

interface ReceiptPreviewProps {
  receipt: Receipt;
  store?: StoreInfo;
  widthMode?: '80mm' | '58mm';
  onWidthToggle?: (mode: '80mm' | '58mm') => void;
  printableId?: string;
}

export const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({
  receipt,
  store = DEFAULT_STORE_INFO,
  widthMode: controlledWidth,
  onWidthToggle,
  printableId = 'printable-receipt',
}) => {
  const [internalWidth, setInternalWidth] = useState<'80mm' | '58mm'>('80mm');
  const [copied, setCopied] = useState<boolean>(false);

  const activeWidth = controlledWidth || internalWidth;
  const setWidth = onWidthToggle || setInternalWidth;

  let parsedData: {
    store?: StoreInfo;
    sale: Sale;
    items: SaleItem[];
    payments: PaymentRecord[];
    customer?: { name: string; phone?: string; loyalty_points?: number } | null;
  };

  try {
    parsedData = JSON.parse(receipt.content_json);
  } catch {
    return (
      <div className="p-4 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl">
        Error reading receipt content data
      </div>
    );
  }

  const { sale, items = [], payments = [], customer } = parsedData;
  const storeInfo = parsedData.store || store;

  const isReprint = Boolean(
    receipt.is_reprint || (receipt.reprint_count && receipt.reprint_count > 0)
  );

  const handleCopyNumber = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(receipt.receipt_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* Paper Width Selector Controls */}
      <div className="flex items-center justify-between w-full max-w-xs mb-3 text-xs">
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setWidth('80mm')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
              activeWidth === '80mm'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            80mm Standard
          </button>
          <button
            type="button"
            onClick={() => setWidth('58mm')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
              activeWidth === '58mm'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            58mm Compact
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopyNumber}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] transition"
          title="Copy Receipt Number"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
          <span>{copied ? 'Copied' : 'Copy #'}</span>
        </button>
      </div>

      {/* Paper Container */}
      <div
        id={printableId}
        className={`bg-white text-slate-950 rounded-lg shadow-2xl font-mono leading-tight select-text transition-all duration-200 border-t-8 border-b-8 border-dashed border-slate-300 p-5 ${
          activeWidth === '80mm' ? 'w-full max-w-xs text-[11px]' : 'w-full max-w-[240px] text-[10px]'
        }`}
      >
        {/* Prominent Duplicate Banner */}
        {isReprint && (
          <div className="mb-3 py-2 px-1 border-2 border-dashed border-red-600 bg-red-50 text-red-700 text-center font-bold tracking-wider rounded animate-pulse">
            <div className="text-xs font-black uppercase">*** DUPLICATE / REPRINT ***</div>
            <div className="text-[10px] mt-0.5">REPRINT #{receipt.reprint_count || 1}</div>
            {receipt.reprinted_at && (
              <div className="text-[9px] font-normal text-red-600">
                {new Date(receipt.reprinted_at).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Store Header */}
        <div className="text-center pb-3 border-b border-dashed border-slate-400">
          <h4 className="font-extrabold text-sm uppercase tracking-wide text-slate-900">{storeInfo.name}</h4>
          <p className="text-[10px] text-slate-600">{storeInfo.tagline}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">{storeInfo.address}</p>
          <p className="text-[10px] text-slate-600">TEL: {storeInfo.phone}</p>
          <p className="text-[10px] text-slate-600">TAX ID / TIN: {storeInfo.tax_id}</p>
        </div>

        {/* Receipt Meta */}
        <div className="py-2.5 border-b border-dashed border-slate-400 text-[10px] space-y-0.5">
          <div className="flex justify-between font-bold">
            <span>RECEIPT:</span>
            <span className="font-extrabold text-slate-950">{sale.receipt_number}</span>
          </div>
          <div className="flex justify-between">
            <span>DATE:</span>
            <span>{new Date(sale.created_at).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>TERMINAL:</span>
            <span>{sale.register_id}</span>
          </div>
          <div className="flex justify-between">
            <span>CASHIER:</span>
            <span>{sale.cashier_id.slice(0, 8)}</span>
          </div>
          {customer && (
            <div className="flex justify-between text-emerald-900 font-bold pt-0.5">
              <span>CUSTOMER:</span>
              <span>{customer.name}</span>
            </div>
          )}
          {customer && customer.loyalty_points !== undefined && (
            <div className="flex justify-between text-emerald-900 text-[9px]">
              <span>LOYALTY BAL:</span>
              <span>{customer.loyalty_points} pts</span>
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
              <span className="font-bold block truncate text-slate-900">{item.product_name}</span>
              <div className="flex justify-between text-slate-600 text-[10px]">
                <span>
                  {item.quantity} x {formatMoney(item.unit_price, storeInfo)}
                </span>
                <span className="font-bold text-slate-900">{formatMoney(item.total_price, storeInfo)}</span>
              </div>
              {item.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-800 text-[9px]">
                  <span>Discount:</span>
                  <span>-{formatMoney(item.discount_amount, storeInfo)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Financial Breakdown */}
        <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span>SUBTOTAL:</span>
            <span>{formatMoney(sale.subtotal, storeInfo)}</span>
          </div>
          {sale.discount_amount > 0 && (
            <div className="flex justify-between text-emerald-800 font-bold">
              <span>DISCOUNTS:</span>
              <span>-{formatMoney(sale.discount_amount, storeInfo)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>TAX (VAT):</span>
            <span>{formatMoney(sale.tax_amount, storeInfo)}</span>
          </div>
          <div className="flex justify-between font-black text-xs pt-1 border-t border-slate-400 text-slate-950">
            <span>TOTAL DUE:</span>
            <span>{formatMoney(sale.total_amount, storeInfo)}</span>
          </div>
        </div>

        {/* Payments & Change */}
        <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
          {payments.map(p => (
            <div key={p.id} className="flex justify-between">
              <span className="uppercase">PAID ({p.method}):</span>
              <span className="font-bold">{formatMoney(p.amount_paid, storeInfo)}</span>
            </div>
          ))}
          {sale.change_amount > 0 && (
            <div className="flex justify-between font-bold pt-0.5 text-slate-900">
              <span>CHANGE GIVEN:</span>
              <span>{formatMoney(sale.change_amount, storeInfo)}</span>
            </div>
          )}
        </div>

        {/* Barcode & Verification */}
        <div className="pt-3 flex flex-col items-center">
          {/* Simulated 1D Barcode */}
          <div className="w-full flex items-center justify-center gap-0.5 py-1 px-4 bg-slate-100 rounded">
            {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 2, 4, 1, 2].map((w, i) => (
              <span
                key={i}
                className="bg-slate-900 inline-block h-7"
                style={{ width: `${w * 1.5}px` }}
              />
            ))}
          </div>
          <span className="text-[9px] font-mono tracking-widest text-slate-500 mt-1">
            *{sale.receipt_number}*
          </span>
        </div>

        {/* Footer Notice */}
        <div className="text-center pt-3 text-[9px] text-slate-600 space-y-1">
          <p className="font-bold uppercase tracking-wider text-slate-800">
            THANK YOU FOR YOUR BUSINESS!
          </p>
          <p>PLEASE RETAIN RECEIPT FOR EXCHANGES OR REFUNDS</p>
          <p className="font-mono text-[8px] text-slate-400 mt-1">ID: {sale.id.slice(0, 18)}...</p>
        </div>
      </div>
    </div>
  );
};
