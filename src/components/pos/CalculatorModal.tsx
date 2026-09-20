import React, { useState } from 'react';
import { X, Delete, Equal } from 'lucide-react';

interface CalculatorModalProps {
  onClose: () => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ onClose }) => {
  const [display, setDisplay] = useState<string>('0');
  const [equation, setEquation] = useState<string>('');

  const handleDigit = (digit: string) => {
    if (display === '0' && digit !== '.') {
      setDisplay(digit);
    } else if (digit === '.' && display.includes('.')) {
      return;
    } else {
      setDisplay(display + digit);
    }
  };

  const handleOperator = (op: string) => {
    setEquation(`${display} ${op} `);
    setDisplay('0');
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
  };

  const handleBackspace = () => {
    if (display.length === 1) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const handleCalculate = () => {
    if (!equation) return;
    try {
      const parts = equation.trim().split(' ');
      if (parts.length < 2) return;
      const num1 = parseFloat(parts[0]);
      const op = parts[1];
      const num2 = parseFloat(display);

      let result = 0;
      switch (op) {
        case '+':
          result = num1 + num2;
          break;
        case '-':
          result = num1 - num2;
          break;
        case '×':
        case '*':
          result = num1 * num2;
          break;
        case '÷':
        case '/':
          result = num2 !== 0 ? num1 / num2 : 0;
          break;
      }
      setDisplay(String(Math.round(result * 100) / 100));
      setEquation('');
    } catch {
      setDisplay('Error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xs shadow-2xl overflow-hidden text-white flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Cashier Calculator</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Display Screen */}
        <div className="p-4 bg-slate-950/90 text-right font-mono">
          <div className="text-xs text-slate-500 h-4">{equation}</div>
          <div className="text-3xl font-extrabold text-white truncate tracking-tight">{display}</div>
        </div>

        {/* Buttons Grid */}
        <div className="p-3 grid grid-cols-4 gap-2 bg-slate-900">
          <button
            onClick={handleClear}
            className="p-3 rounded-2xl bg-rose-950/70 border border-rose-800/60 text-rose-400 font-bold hover:bg-rose-900/80 active:scale-95 transition"
          >
            C
          </button>
          <button
            onClick={handleBackspace}
            className="p-3 rounded-2xl bg-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-700 active:scale-95 transition"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOperator('÷')}
            className="p-3 rounded-2xl bg-indigo-950/70 border border-indigo-800 text-indigo-300 font-bold hover:bg-indigo-900 active:scale-95 transition"
          >
            ÷
          </button>
          <button
            onClick={() => handleOperator('×')}
            className="p-3 rounded-2xl bg-indigo-950/70 border border-indigo-800 text-indigo-300 font-bold hover:bg-indigo-900 active:scale-95 transition"
          >
            ×
          </button>

          {['7', '8', '9'].map(d => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700/60 text-lg font-bold hover:bg-slate-700 active:scale-95 transition"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => handleOperator('-')}
            className="p-3 rounded-2xl bg-indigo-950/70 border border-indigo-800 text-indigo-300 font-bold hover:bg-indigo-900 active:scale-95 transition"
          >
            -
          </button>

          {['4', '5', '6'].map(d => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700/60 text-lg font-bold hover:bg-slate-700 active:scale-95 transition"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => handleOperator('+')}
            className="p-3 rounded-2xl bg-indigo-950/70 border border-indigo-800 text-indigo-300 font-bold hover:bg-indigo-900 active:scale-95 transition"
          >
            +
          </button>

          {['1', '2', '3'].map(d => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700/60 text-lg font-bold hover:bg-slate-700 active:scale-95 transition"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleCalculate}
            className="row-span-2 p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold flex items-center justify-center active:scale-95 shadow-lg shadow-indigo-600/30 transition"
          >
            <Equal className="w-5 h-5" />
          </button>

          <button
            onClick={() => handleDigit('0')}
            className="col-span-2 p-3 rounded-2xl bg-slate-800/90 border border-slate-700/60 text-lg font-bold hover:bg-slate-700 active:scale-95 transition"
          >
            0
          </button>
          <button
            onClick={() => handleDigit('.')}
            className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700/60 text-lg font-bold hover:bg-slate-700 active:scale-95 transition"
          >
            .
          </button>
        </div>
      </div>
    </div>
  );
};
