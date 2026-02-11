
import React, { useState, useEffect } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { Order, OrderStatus } from '../types';

const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);

  const fetchOrders = async () => {
    const { data } = await supabase.from('orders')
      .select('*, table:tables(name), items:order_items(*)')
      .order('created_at', { ascending: false });
    
    if (data) {
      setOrders(data.map(o => ({
        ...o,
        table_name: (o as any).table?.name,
        items: (o as any).items
      })));
    }
  };

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel('admin_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleUpdateStatus = async (id: string, status: OrderStatus, sessionId?: string, tableId?: string) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    
    if (status === 'FINISHED' || status === 'CANCELLED') {
      if (sessionId) await supabase.from('sessions').update({ status: 'EXPIRED' }).eq('id', sessionId);
      if (tableId) await supabase.from('tables').update({ status: 'FREE' }).eq('id', tableId);
    }
    fetchOrders();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {orders.length === 0 ? (
        <div className="col-span-full text-center py-20 text-gray-300 font-black uppercase tracking-widest text-[10px] flex flex-col items-center gap-4 italic">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          Nenhum pedido ativo no momento
        </div>
      ) : (
        orders.map(order => (
          <div key={order.id} className="bg-white border border-gray-200 rounded-[28px] overflow-hidden flex flex-col">
            <div className="p-5 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="font-black text-gray-800 text-lg uppercase tracking-tighter">{order.table_name}</h3>
                <span className="text-[9px] text-gray-400 font-bold tracking-widest uppercase">#{order.id.slice(0,6)} • {new Date(order.created_at).toLocaleTimeString()}</span>
              </div>
              <span className={`px-3 py-1.5 rounded-full text-[8px] font-black tracking-widest border uppercase ${
                order.status === 'PENDING' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                order.status === 'PREPARING' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                order.status === 'READY' ? 'bg-green-50 text-green-600 border-green-100' :
                'bg-gray-100 text-gray-400 border-gray-100'
              }`}>
                {order.status}
              </span>
            </div>
            
            <div className="p-5 space-y-3 flex-1">
              {order.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start text-sm border-b border-gray-50 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex gap-3">
                    <span className="font-black text-primary bg-primary/5 w-7 h-7 rounded-lg flex items-center justify-center text-xs">{item.qty}x</span>
                    <div>
                      <p className="font-black text-gray-800 text-sm">{item.name_snapshot}</p>
                      <p className="text-[8px] text-gray-400 uppercase font-black tracking-widest mt-1">
                        Solicitado por {item.added_by_name}
                      </p>
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
              <button onClick={() => handleUpdateStatus(order.id, 'CANCELLED', order.session_id, order.table_id)} className="w-12 h-12 border border-gray-200 text-red-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center rounded-xl transition-all active:scale-95">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default AdminOrders;
