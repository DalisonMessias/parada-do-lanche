import React, { useEffect, useMemo, useState } from 'react';
import AppModal from './AppModal';

interface CalculatorModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

const operators = ['+', '-', 'x', '/'] as const;
type Operator = (typeof operators)[number];

const formatDisplay = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const evaluateSimple = (expr: string) => {
  const normalized = expr
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/x/gi, '*');
  const tokens = normalized.match(/(\d+(\.\d+)?)|[+\-*/]/g) || [];
  if (tokens.length === 0) return 0;

  let acc = 0;
  let currentOp: '+' | '-' | '*' | '/' = '+';

  for (const token of tokens) {
    if (/^[+\-*/]$/.test(token)) {
      currentOp = token as '+' | '-' | '*' | '/';
      continue;
    }

    const num = Number(token);
    if (!Number.isFinite(num)) continue;

    if (currentOp === '+') acc += num;
    if (currentOp === '-') acc -= num;
    if (currentOp === '*') acc *= num;
    if (currentOp === '/') acc = num === 0 ? acc : acc / num;
  }

  return Number.isFinite(acc) ? acc : 0;
};

const CalculatorModal: React.FC<CalculatorModalProps> = ({ open, onClose, title = 'Calculadora' }) => {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState(0);
  const [history, setHistory] = useState<string[]>([]);

  const append = (value: string) => {
    setExpression((prev) => `${prev}${value}`);
  };

  const applyOperator = (op: Operator) => {
    setExpression((prev) => {
      if (!prev) return '';
      const last = prev.slice(-1);
      if (operators.includes(last as Operator)) {
        return `${prev.slice(0, -1)}${op}`;
      }
      return `${prev}${op}`;
    });
  };

  const backspace = () => setExpression((prev) => prev.slice(0, -1));
  const clearAll = () => {
    setExpression('');
    setResult(0);
  };

  const calculate = () => {
    if (!expression.trim()) return;
    const value = evaluateSimple(expression);
    setResult(value);
    const line = `${expression.replace(/\*/g, 'x')} = ${formatDisplay(value)}`;
    setHistory((prev) => [line, ...prev].slice(0, 10));
  };

  const saveCurrentToHistory = () => {
    const line = `${expression || formatDisplay(result)} = ${formatDisplay(result)}`;
    setHistory((prev) => [line, ...prev].slice(0, 10));
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(formatDisplay(result));
    } catch {
      // noop
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        append(event.key);
      } else if (event.key === '.' || event.key === ',') {
        append(',');
      } else if (event.key === '+' || event.key === '-') {
        applyOperator(event.key as Operator);
      } else if (event.key === '*') {
        applyOperator('x');
      } else if (event.key === '/') {
        applyOperator('/');
      } else if (event.key === 'Enter' || event.key === '=') {
        event.preventDefault();
        calculate();
      } else if (event.key === 'Backspace') {
        backspace();
      } else if (event.key === 'Delete') {
        clearAll();
      } else if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, expression, onClose]);

  const expressionPreview = useMemo(() => {
    if (!expression) return '0';
    return expression.replace(/\*/g, 'x');
  }, [expression]);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      zIndex={260}
      bodyClassName="space-y-4"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyResult}
            className="py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest"
          >
            Copiar Resultado
          </button>
          <button
            type="button"
            onClick={saveCurrentToHistory}
            className="py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest"
          >
            Salvar no Historico
          </button>
        </div>
      }
    >
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Expressao</p>
        <p className="text-lg font-black text-gray-800 break-all">{expressionPreview}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-3">Resultado</p>
        <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatDisplay(result)}</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {['7', '8', '9'].map((digit) => (
          <button key={digit} onClick={() => append(digit)} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">
            {digit}
          </button>
        ))}
        <button onClick={() => applyOperator('/')} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">/</button>

        {['4', '5', '6'].map((digit) => (
          <button key={digit} onClick={() => append(digit)} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">
            {digit}
          </button>
        ))}
        <button onClick={() => applyOperator('x')} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">x</button>

        {['1', '2', '3'].map((digit) => (
          <button key={digit} onClick={() => append(digit)} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">
            {digit}
          </button>
        ))}
        <button onClick={() => applyOperator('-')} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">-</button>

        <button onClick={clearAll} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">C</button>
        <button onClick={() => append('0')} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">0</button>
        <button onClick={() => append(',')} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">,</button>
        <button onClick={() => applyOperator('+')} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">+</button>

        <button onClick={backspace} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">{'<-'}</button>
        <button onClick={() => append('00')} className="py-3 rounded-xl border border-gray-200 font-black text-gray-700">00</button>
        <button onClick={calculate} className="col-span-2 py-3 rounded-xl bg-primary text-white font-black">=</button>
      </div>

      <div className="rounded-2xl border border-gray-100 p-3 bg-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Historico</p>
        {history.length === 0 ? (
          <p className="text-sm font-bold text-gray-400">Sem calculos salvos.</p>
        ) : (
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {history.map((line, index) => (
              <p key={`${line}-${index}`} className="text-sm font-black text-gray-700">{line}</p>
            ))}
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default CalculatorModal;
