import React, { useState } from 'react';
import {
  LogIn,
  PlayCircle,
  LayoutDashboard,
  PlusCircle,
  ScanLine,
  PackageCheck,
  ShoppingCart,
  CheckSquare,
  UserCheck,
  CreditCard,
  CheckCircle,
  Printer,
  Boxes,
  BarChart2,
  Award,
  BadgeCheck,
  UserPlus,
  Lock,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import { usePos } from '../../store/posStore';

interface WorkflowStepDef {
  number: number;
  label: string;
  shortName: string;
  icon: React.ComponentType<{ className?: string }>;
  decisionLabel?: string;
  description: string;
}

const WORKFLOW_STEPS: WorkflowStepDef[] = [
  { number: 1, label: 'Login', shortName: 'Login', icon: LogIn, description: 'Cashier authentication & register binding' },
  { number: 2, label: 'Open Shift', shortName: 'Open Shift', icon: PlayCircle, description: 'Cash drawer float count & shift open' },
  { number: 3, label: 'Dashboard', shortName: 'Dashboard', icon: LayoutDashboard, description: 'Terminal status & sales monitoring' },
  { number: 4, label: 'New Sale', shortName: 'New Sale', icon: PlusCircle, description: 'Initialize fresh cart session' },
  { number: 5, label: 'Scan / Search', shortName: 'Scan/Search', icon: ScanLine, decisionLabel: 'Product Found?', description: 'Barcode scan or SKU/name lookup' },
  { number: 6, label: 'Check Stock', shortName: 'Check Stock', icon: PackageCheck, decisionLabel: 'In Stock?', description: 'Inventory availability check' },
  { number: 7, label: 'Add to Cart', shortName: 'Add to Cart', icon: ShoppingCart, decisionLabel: 'More Products?', description: 'Increment line quantity & calculate line totals' },
  { number: 8, label: 'Review Cart', shortName: 'Review Cart', icon: CheckSquare, description: 'Item adjustments, discounts & order totals' },
  { number: 9, label: 'Customer', shortName: 'Customer', icon: UserCheck, description: 'Select member or walk-in guest' },
  { number: 10, label: 'Payment', shortName: 'Payment', icon: CreditCard, description: 'Tender cash, card, mobile wallet, or QR' },
  { number: 11, label: 'Payment Validated', shortName: 'Payment Validated', icon: CheckCircle, decisionLabel: 'Payment Successful?', description: 'Verify full tender received' },
  { number: 12, label: 'Receipt', shortName: 'Receipt', icon: Printer, description: 'Generate & thermal print receipt' },
  { number: 13, label: 'Update Inventory', shortName: 'Update Inventory', icon: Boxes, description: 'Atomic stock decrement & movement log' },
  { number: 14, label: 'Update Sales Report', shortName: 'Update Sales Report', icon: BarChart2, description: 'Atomic shift sales aggregates' },
  { number: 15, label: 'Update Loyalty Points', shortName: 'Update Loyalty Points', icon: Award, description: 'Customer loyalty balance accrual' },
  { number: 16, label: 'Sale Completed', shortName: 'Sale Completed', icon: BadgeCheck, description: 'Transaction committed & verified' },
  { number: 17, label: 'Next Customer', shortName: 'Next Customer', icon: UserPlus, description: 'Reset cart & start new transaction' },
  { number: 18, label: 'Close Shift', shortName: 'Close Shift', icon: Lock, description: 'Cash drawer count, variance check & logout' },
];

export const WorkflowStepper: React.FC = () => {
  const { activeWorkflowStep } = usePos();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const currentStepDef = WORKFLOW_STEPS.find(s => s.number === activeWorkflowStep) || WORKFLOW_STEPS[0];
  const Icon = currentStepDef.icon;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg mb-4 overflow-hidden transition-all duration-200">
      {/* Primary Bar: Shows Active Step & Compact Breadcrumb */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-7 h-7 rounded-xl bg-sky-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-sky-600/30">
              {currentStepDef.number}
            </span>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-white">
              <Icon className="w-4 h-4 text-sky-400" />
              <span>{currentStepDef.label}</span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block shrink-0" />

          {/* Subtitle / Decision Pill */}
          <div className="flex items-center gap-2 truncate">
            {currentStepDef.decisionLabel && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60 shrink-0">
                Decision: {currentStepDef.decisionLabel}
              </span>
            )}
            <span className="text-xs text-slate-400 truncate hidden md:inline">
              {currentStepDef.description}
            </span>
          </div>
        </div>

        {/* Progress % & Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden xs:block">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">18-Step Workflow</span>
            <span className="text-xs font-bold text-sky-400 font-mono">
              Step {activeWorkflowStep} of 18 ({Math.round((activeWorkflowStep / 18) * 100)}%)
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
            title={isExpanded ? 'Collapse 18-step overview' : 'Expand full 18-step diagram roadmap'}
          >
            <span className="text-[11px] hidden sm:inline">{isExpanded ? 'Hide Steps' : 'View All 18 Steps'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Mini Progress Bar Line */}
      <div className="w-full bg-slate-950 h-1">
        <div
          className="bg-gradient-to-r from-sky-500 via-emerald-500 to-sky-400 h-1 transition-all duration-300"
          style={{ width: `${(activeWorkflowStep / 18) * 100}%` }}
        />
      </div>

      {/* Expandable 18-Step Roadmap Grid */}
      {isExpanded && (
        <div className="p-4 bg-slate-950/90 border-t border-slate-800/80 animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
              Authoritative POS Business Process (Reproducing System Flow Diagram)
            </span>
            <span className="text-[11px] text-slate-500">
              Steps 13-15 execute as ACID multi-entity transactions in IndexedDB
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-2">
            {WORKFLOW_STEPS.map(step => {
              const isPast = step.number < activeWorkflowStep;
              const isCurrent = step.number === activeWorkflowStep;
              const StepIcon = step.icon;

              return (
                <div
                  key={step.number}
                  className={`p-2 rounded-xl border text-left transition relative flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-sky-950/70 border-sky-500 shadow-md ring-1 ring-sky-500/40 text-white'
                      : isPast
                      ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                      : 'bg-slate-950/40 border-slate-900 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        isCurrent
                          ? 'bg-sky-500 text-slate-950'
                          : isPast
                          ? 'bg-slate-800 text-slate-300'
                          : 'bg-slate-900 text-slate-600'
                      }`}
                    >
                      {step.number}
                    </span>
                    <StepIcon
                      className={`w-3.5 h-3.5 ${
                        isCurrent ? 'text-sky-400' : isPast ? 'text-slate-400' : 'text-slate-700'
                      }`}
                    />
                  </div>

                  <span className={`text-[11px] font-bold block truncate ${isCurrent ? 'text-sky-200' : ''}`}>
                    {step.shortName}
                  </span>

                  {step.decisionLabel && (
                    <span className="text-[9px] text-amber-400/90 font-medium block truncate mt-0.5">
                      ? {step.decisionLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
