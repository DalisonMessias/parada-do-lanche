import React, { useMemo, useState } from 'react';
import { useFeedback } from './feedback/FeedbackProvider';
import { readDeliveryPrompt, saveDeliveryPrompt } from '../services/deliverySession';

const EXAMPLES = [
  'Quero hambúrguer com batata e refrigerante',
  'Preciso de 2 combos para entregar em casa',
  'Quero lanche sem cebola e com molho extra',
];

const PublicDeliveryIntro: React.FC = () => {
  const { toast } = useFeedback();
  const [value, setValue] = useState(() => readDeliveryPrompt());

  const placeholder = useMemo(
    () => 'Ex.: Quero 2 hambúrgueres, 1 porção e 1 refrigerante',
    []
  );

  const goMenu = (nextValue: string) => {
    const normalized = (nextValue || '').trim();
    if (!normalized) {
      toast('Descreva rapidamente o que voce quer receber em casa.', 'info');
      return;
    }
    saveDeliveryPrompt(normalized);
    window.history.pushState({}, '', '/menudigital/menu');
  };

  return (
    <div className="min-h-[85vh] p-6 lg:p-10 flex items-center justify-center">
      <section className="w-full max-w-2xl bg-white border border-gray-200 rounded-[28px] p-8 lg:p-12 space-y-8 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
        <div className="space-y-3 text-center">
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.18em]">Entrega</p>
          <h2 className="text-3xl lg:text-5xl font-black text-gray-900 uppercase tracking-tighter leading-none">
            O que voce quer receber em casa?
          </h2>
          <p className="text-sm lg:text-base text-gray-500 font-bold leading-relaxed max-w-xl mx-auto">
            Conte rapidamente seu pedido e siga para o menu digital exclusivo de entrega.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
            Seu pedido (resumo)
          </label>
          <textarea
            rows={4}
            value={value}
            maxLength={240}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 font-bold text-gray-800 outline-none focus:border-primary"
          />
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">
            {value.length}/240
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Exemplos</p>
          <div className="grid gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setValue(example)}
                className="text-left px-4 py-3 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-gray-700 hover:border-primary/40"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => window.history.pushState({}, '', '/')}
            className="sm:flex-1 px-5 py-4 rounded-xl border border-gray-200 text-[11px] font-black uppercase tracking-widest text-gray-700"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => goMenu(value)}
            className="sm:flex-1 px-5 py-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest"
          >
            Continuar Para O Menu
          </button>
        </div>
      </section>
    </div>
  );
};

export default PublicDeliveryIntro;
