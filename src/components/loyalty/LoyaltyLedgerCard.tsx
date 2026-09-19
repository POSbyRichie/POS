import React from 'react';
import { Award, ArrowUpRight, ArrowDownRight, RefreshCw, Calendar, Receipt } from 'lucide-react';
import { LoyaltyTransaction } from '../../types';

interface LoyaltyLedgerCardProps {
  transaction: LoyaltyTransaction;
}

export const LoyaltyLedgerCard: React.FC<LoyaltyLedgerCardProps> = ({ transaction }) => {
  const isPositive = transaction.points_delta > 0;
  const isZero = transaction.points_delta === 0;

  const formattedDelta = isPositive
    ? `+${transaction.points_delta} points`
    : `${transaction.points_delta} points`;

  const dateFormatted = new Date(transaction.timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const saleLabel = transaction.receipt_number
    ? `Sale #${transaction.receipt_number}`
    : transaction.sale_id
      ? `Sale #${transaction.sale_id.slice(0, 8).toUpperCase()}`
      : transaction.reason || 'Account Adjustment';

  return (
    <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition shadow-md">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-amber-400">
          <Award className="w-3.5 h-3.5" />
          <span>LOYALTY TRANSACTION</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
            transaction.type === 'EARN'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
              : transaction.type === 'REDEEM'
                ? 'bg-purple-950 text-purple-400 border border-purple-800/60'
                : 'bg-sky-950 text-sky-400 border border-sky-800/60'
          }`}
        >
          {transaction.type}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            {isPositive ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            ) : isZero ? (
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            )}
            <span
              className={`text-base font-extrabold font-mono ${
                isPositive ? 'text-emerald-400' : isZero ? 'text-slate-300' : 'text-rose-400'
              }`}
            >
              {formattedDelta}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs text-sky-300 font-semibold mt-1">
            <Receipt className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="font-mono">{saleLabel}</span>
          </div>
        </div>

        <div className="text-right text-[11px] text-slate-400">
          <div className="font-mono">
            <span>Prev: {transaction.previous_points}</span>
            <span className="text-slate-600 mx-1">&rarr;</span>
            <span className="text-white font-bold">New: {transaction.new_points}</span>
          </div>
          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-1">
            <Calendar className="w-2.5 h-2.5" />
            <span>{dateFormatted}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
