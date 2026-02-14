import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { StoreFeedback } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

type PeriodFilter = 'TODAY' | '7D' | '30D' | 'CUSTOM';
type RatingFilter = 'ALL' | '1' | '2' | '3' | '4' | '5';

const AdminRatings: React.FC = () => {
  const { toast } = useFeedback();
  const [rows, setRows] = useState<StoreFeedback[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>('7D');
  const [rating, setRating] = useState<RatingFilter>('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const load = async () => {
    const { data, error } = await supabase
      .from('store_feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast(`Erro ao carregar avaliacoes: ${error.message}`, 'error');
      return;
    }
    setRows((data || []) as StoreFeedback[]);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const now = new Date();
    return rows.filter((row) => {
      const createdAt = new Date(row.created_at);
      if (Number.isNaN(createdAt.getTime())) return false;

      if (rating !== 'ALL' && Number(row.stars) !== Number(rating)) return false;

      if (period === 'TODAY') {
        return (
          createdAt.getFullYear() === now.getFullYear() &&
          createdAt.getMonth() === now.getMonth() &&
          createdAt.getDate() === now.getDate()
        );
      }
      if (period === '7D') {
        const min = new Date(now);
        min.setDate(min.getDate() - 7);
        return createdAt >= min;
      }
      if (period === '30D') {
        const min = new Date(now);
        min.setDate(min.getDate() - 30);
        return createdAt >= min;
      }
      if (period === 'CUSTOM') {
        const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
        const to = customTo ? new Date(`${customTo}T23:59:59`) : null;
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
      }
      return true;
    });
  }, [rows, period, rating, customFrom, customTo]);

  const total = filteredRows.length;
  const average = total > 0 ? filteredRows.reduce((acc, row) => acc + Number(row.stars || 0), 0) / total : 0;
  const distribution = useMemo(() => {
    const map: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    filteredRows.forEach((row) => {
      const stars = Math.max(1, Math.min(5, Number(row.stars || 0)));
      map[stars] += 1;
    });
    return map;
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-[28px] p-6">
        <h2 className="text-3xl font-black uppercase tracking-tighter text-gray-900">Avaliacoes</h2>
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2">Notas e comentarios do cardapio digital</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Media de estrelas</p>
          <p className="text-3xl font-black text-gray-900 tracking-tighter">{average.toFixed(1)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Total de avaliacoes</p>
          <p className="text-3xl font-black text-gray-900 tracking-tighter">{total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Distribuicao</p>
          <p className="text-[10px] font-black text-gray-700">5⭐ {distribution[5]} • 4⭐ {distribution[4]} • 3⭐ {distribution[3]}</p>
          <p className="text-[10px] font-black text-gray-700">2⭐ {distribution[2]} • 1⭐ {distribution[1]}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 grid md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Periodo</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            className="w-full p-3 rounded-xl border border-gray-200 font-bold bg-white"
          >
            <option value="TODAY">Hoje</option>
            <option value="7D">Ultimos 7 dias</option>
            <option value="30D">Ultimos 30 dias</option>
            <option value="CUSTOM">Personalizado</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Nota</label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value as RatingFilter)}
            className="w-full p-3 rounded-xl border border-gray-200 font-bold bg-white"
          >
            <option value="ALL">Todas</option>
            <option value="5">5 estrelas</option>
            <option value="4">4 estrelas</option>
            <option value="3">3 estrelas</option>
            <option value="2">2 estrelas</option>
            <option value="1">1 estrela</option>
          </select>
        </div>
        {period === 'CUSTOM' && (
          <>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Data inicial</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 font-bold bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Data final</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 font-bold bg-white"
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-3">
        {filteredRows.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-400 font-black uppercase tracking-widest text-[10px]">
            Nenhuma avaliacao no filtro atual
          </div>
        )}
        {filteredRows.map((row) => (
          <div key={row.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 text-[10px] font-black uppercase tracking-widest">
                  {Number(row.stars)} estrelas
                </span>
                {row.customer_name && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                    {row.customer_name}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                {new Date(row.created_at).toLocaleString('pt-BR')}
              </p>
            </div>
            {row.comment && (
              <p className="text-sm font-bold text-gray-700 whitespace-pre-line">{row.comment}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminRatings;

