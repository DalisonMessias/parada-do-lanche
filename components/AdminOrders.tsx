import React, { useEffect, useMemo, useState } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { Order, OrderStatus } from '../types';

const getTodayInputDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const statusClass: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-600 border-amber-100',
  PREPARING: 'bg-blue-50 text-blue-600 border-blue-100',
  READY: 'bg-green-50 text-green-600 border-green-100',
  FINISHED: 'bg-gray-100 text-gray-500 border-gray-200',
  CANCELLED: 'bg-red-50 text-red-500 border-red-100',
};

const statusLabel: Record<OrderStatus, string> = {
  PENDING: 'Pendente',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTableName, setSelectedTableName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayInputDate());

  const fetchOrders = async () => {
    let query = supabase
      .from('orders')
      .select('*, table:tables(name), items:order_items(*)')
      .order('created_at', { ascending: false });

    if (selectedDate) {
      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(`${selectedDate}T23:59:59.999`);
      query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    }

    const { data } = await query;

    if (data) {
      setOrders(
        data.map((o) => ({
          ...o,
          table_name: (o as any).table?.name,
          items: (o as any).items || [],
        }))
      );
    }
  };

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel(`admin_orders_${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  const selectedSessionOrders = useMemo(() => {
    if (!selectedSessionId) return [];
    return orders.filter((o) => o.session_id === selectedSessionId);
  }, [orders, selectedSessionId]);

  const selectedSessionTotal = useMemo(() => {
    return selectedSessionOrders
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((acc, o) => acc + o.total_cents, 0);
  }, [selectedSessionOrders]);

  const selectedSessionByGuest = useMemo(() => {
    const map = new Map<string, number>();
    selectedSessionOrders
      .filter((o) => o.status !== 'CANCELLED')
      .forEach((order) => {
        (order.items || []).forEach((item) => {
          const current = map.get(item.added_by_name) || 0;
          map.set(item.added_by_name, current + item.qty * item.unit_price_cents);
        });
      });
    return Array.from(map.entries()).map(([name, total]) => ({ name, total }));
  }, [selectedSessionOrders]);

  const handleOpenSession = (order: Order) => {
    setSelectedSessionId(order.session_id);
    setSelectedTableName(order.table_name || 'Mesa');
  };

  const handleUpdateStatus = async (id: string, status: OrderStatus, sessionId?: string, tableId?: string) => {
    await supabase.from('orders').update({ status }).eq('id', id);

    if (status === 'FINISHED' || status === 'CANCELLED') {
      if (sessionId) await supabase.from('sessions').update({ status: 'EXPIRED' }).eq('id', sessionId);
      if (tableId) await supabase.from('tables').update({ status: 'FREE' }).eq('id', tableId);
    }
    fetchOrders();
  };

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Filtrar por data</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-black text-gray-700 outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={() => setSelectedDate(getTodayInputDate())}
          className="px-4 py-2.5 rounded-lg bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest"
        >
          Hoje
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {orders.length === 0 ? (
          <div className="col-span-full text-center py-20 text-gray-300 font-black uppercase tracking-widest text-[10px] flex flex-col items-center gap-4 italic">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
            Nenhum pedido ativo nesta data
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white border border-gray-200 rounded-[28px] overflow-hidden flex flex-col">
              <button onClick={() => handleOpenSession(order)} className="p-5 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center text-left hover:bg-gray-50 transition-colors">
                <div>
                  <h3 className="font-black text-gray-800 text-lg uppercase tracking-tighter">{order.table_name}</h3>
                  <span className="text-[9px] text-gray-400 font-bold tracking-widest uppercase">
                    #{order.id.slice(0, 6)} • {new Date(order.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-[8px] font-black tracking-widest border uppercase ${statusClass[order.status]}`}>
                  {statusLabel[order.status]}
                </span>
              </button>

              <div className="p-5 space-y-3 flex-1">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-sm border-b border-gray-50 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex gap-3">
                      <span className="font-black text-primary bg-primary/5 w-7 h-7 rounded-lg flex items-center justify-center text-xs">{item.qty}x</span>
                      <div>
                        <p className="font-black text-gray-800 text-sm">{item.name_snapshot}</p>
                        <p className="text-[8px] text-gray-400 uppercase font-black tracking-widest mt-1">Solicitado por {item.added_by_name}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3.5 bg-gray-50/30 border-t border-gray-100 flex justify-between items-center font-black">
                <span className="text-[9px] uppercase text-gray-400 tracking-widest">Total Geral</span>
                <span className="text-lg text-gray-900 tracking-tighter italic">{formatCurrency(order.total_cents)}</span>
              </div>

              <div className="p-5 pt-0 flex gap-2">
                {order.status === 'PENDING' && (
                  <button onClick={() => handleUpdateStatus(order.id, 'PREPARING')} className="flex-1 bg-blue-600 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-transform active:scale-95">Iniciar Preparo</button>
                )}
                {order.status === 'PREPARING' && (
                  <button onClick={() => handleUpdateStatus(order.id, 'READY')} className="flex-1 bg-green-600 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-transform active:scale-95">Marcar Pronto</button>
                )}
                {order.status === 'READY' && (
                  <button onClick={() => handleUpdateStatus(order.id, 'FINISHED', order.session_id, order.table_id)} className="flex-1 bg-gray-900 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-transform active:scale-95">Concluir Mesa</button>
                )}
                {order.status !== 'FINISHED' && order.status !== 'CANCELLED' && (
                  <button onClick={() => handleUpdateStatus(order.id, 'CANCELLED', order.session_id, order.table_id)} className="w-12 h-12 border border-gray-200 text-red-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center rounded-xl transition-all active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedSessionId && (
        <div className="fixed inset-0 z-[200] bg-gray-900/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-4xl bg-white rounded-t-[28px] sm:rounded-[30px] border border-gray-200 p-5 sm:p-8 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900">Resumo da {selectedTableName}</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  Sessao com {selectedSessionOrders.length} pedido(s)
                </p>
              </div>
              <button onClick={() => setSelectedSessionId(null)} className="text-gray-400 font-black">Fechar</button>
            </div>

            <div className="space-y-4">
              {selectedSessionOrders.map((order) => (
                <div key={order.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-black text-gray-800 uppercase tracking-widest">
                      Pedido #{order.id.slice(0, 6)} • {new Date(order.created_at).toLocaleTimeString()}
                    </p>
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black tracking-widest border uppercase ${statusClass[order.status]}`}>
                      {statusLabel[order.status]}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
                        <div>
                          <p className="font-black text-gray-800">{item.qty}x {item.name_snapshot}</p>
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                            {item.added_by_name}
                          </p>
                        </div>
                        <span className="font-black text-gray-700">{formatCurrency(item.unit_price_cents * item.qty)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-sm font-black">
                    <span className="text-gray-400 uppercase tracking-widest text-[10px]">Subtotal do pedido</span>
                    <span className="text-gray-900">{formatCurrency(order.total_cents)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Total para cobrar</span>
                <span className="text-2xl font-black text-gray-900 tracking-tighter italic">{formatCurrency(selectedSessionTotal)}</span>
              </div>
              {selectedSessionByGuest.length > 0 && (
                <div className="space-y-1">
                  {selectedSessionByGuest.map((row) => (
                    <div key={row.name} className="flex justify-between items-center text-sm">
                      <span className="font-black text-gray-600">{row.name}</span>
                      <span className="font-black text-gray-800">{formatCurrency(row.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminOrders;
