import React, { useEffect, useMemo, useState } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { Guest, Order, OrderItem, OrderStatus, Session } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

type AdminOrdersMode = 'ACTIVE' | 'FINISHED';

type SessionAggregate = Session & {
  table?: { name: string } | null;
  guests?: Guest[];
  orders?: (Order & { items?: OrderItem[] })[];
};

interface AdminOrdersProps {
  mode: AdminOrdersMode;
}

const getTodayInputDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const orderStatusClass: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-600 border-amber-100',
  PREPARING: 'bg-blue-50 text-blue-600 border-blue-100',
  READY: 'bg-green-50 text-green-600 border-green-100',
  FINISHED: 'bg-gray-100 text-gray-500 border-gray-200',
  CANCELLED: 'bg-red-50 text-red-500 border-red-100',
};

const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING: 'Pendente',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

const itemStatusLabel = {
  PENDING: 'Pendente',
  READY: 'Pronto',
} as const;

const normalizeSession = (row: any): SessionAggregate => {
  const orders = ((row.orders || []) as any[]).map((order) => ({
    ...order,
    items: (order.items || []) as OrderItem[],
  }));

  return {
    ...row,
    table: row.table || null,
    guests: (row.guests || []) as Guest[],
    orders,
  };
};

const sumOrderItems = (items: OrderItem[] = []) => items.reduce((acc, item) => acc + (item.qty || 0), 0);

const AdminOrders: React.FC<AdminOrdersProps> = ({ mode }) => {
  const [sessions, setSessions] = useState<SessionAggregate[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayInputDate());
  const [splitMode, setSplitMode] = useState<'EQUAL' | 'CONSUMPTION'>('CONSUMPTION');
  const [splitPeople, setSplitPeople] = useState(2);

  const { toast, confirm } = useFeedback();

  const fetchSessions = async () => {
    const statusFilter = mode === 'ACTIVE' ? 'OPEN' : 'EXPIRED';

    const { data, error } = await supabase
      .from('sessions')
      .select('*, table:tables(name), guests:session_guests(*), orders:orders(*, items:order_items(*))')
      .eq('status', statusFilter)
      .order('created_at', { ascending: false });

    if (error) {
      toast(`Erro ao buscar mesas: ${error.message}`, 'error');
      return;
    }

    setSessions((data || []).map(normalizeSession));
  };

  useEffect(() => {
    fetchSessions();

    const channel = supabase
      .channel(`admin_tables_${mode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, fetchSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchSessions)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mode]);

  const filteredSessions = useMemo(() => {
    if (!selectedDate) return sessions;

    const start = new Date(`${selectedDate}T00:00:00`);
    const end = new Date(`${selectedDate}T23:59:59.999`);

    return sessions.filter((session) => {
      const baseDate = mode === 'FINISHED' ? (session.closed_at || session.created_at) : session.created_at;
      const dt = new Date(baseDate);
      return dt >= start && dt <= end;
    });
  }, [sessions, selectedDate, mode]);

  const selectedSession = useMemo(
    () => filteredSessions.find((session) => session.id === selectedSessionId) || null,
    [filteredSessions, selectedSessionId]
  );

  const getApprovedOrders = (session: SessionAggregate) => {
    return (session.orders || []).filter((order) => order.approval_status !== 'REJECTED');
  };

  const getConfirmedOrders = (session: SessionAggregate) => {
    return getApprovedOrders(session).filter((order) => order.approval_status === 'APPROVED');
  };

  const getSessionTotal = (session: SessionAggregate) => {
    return getConfirmedOrders(session)
      .filter((order) => order.status !== 'CANCELLED')
      .reduce((acc, order) => acc + order.total_cents, 0);
  };

  const getSessionItemsCount = (session: SessionAggregate) => {
    return getConfirmedOrders(session)
      .filter((order) => order.status !== 'CANCELLED')
      .reduce((acc, order) => acc + sumOrderItems(order.items), 0);
  };

  const getPendingApprovals = (session: SessionAggregate) => {
    return (session.orders || []).filter((order) => order.approval_status === 'PENDING_APPROVAL');
  };

  const getTotalsByGuest = (session: SessionAggregate) => {
    const map = new Map<string, { total: number; items: number }>();

    getConfirmedOrders(session)
      .filter((order) => order.status !== 'CANCELLED')
      .forEach((order) => {
        (order.items || []).forEach((item) => {
          const key = item.added_by_name || 'Sem nome';
          const row = map.get(key) || { total: 0, items: 0 };
          row.total += item.qty * item.unit_price_cents;
          row.items += item.qty;
          map.set(key, row);
        });
      });

    return Array.from(map.entries()).map(([name, row]) => ({ name, total: row.total, items: row.items }));
  };

  const getConsolidatedItems = (session: SessionAggregate) => {
    const map = new Map<string, { qty: number; total: number; notes: string[]; ready: number; pending: number }>();

    getConfirmedOrders(session)
      .filter((order) => order.status !== 'CANCELLED')
      .forEach((order) => {
        (order.items || []).forEach((item) => {
          const key = `${item.name_snapshot}__${item.note || ''}`;
          const row = map.get(key) || { qty: 0, total: 0, notes: [], ready: 0, pending: 0 };
          row.qty += item.qty;
          row.total += item.qty * item.unit_price_cents;
          if (item.note && !row.notes.includes(item.note)) row.notes.push(item.note);
          if (item.status === 'READY') row.ready += item.qty;
          else row.pending += item.qty;
          map.set(key, row);
        });
      });

    return Array.from(map.entries()).map(([key, row]) => ({
      key,
      name: key.split('__')[0],
      ...row,
    }));
  };

  const handleApproveOrder = async (order: Order) => {
    const ok = await confirm(`Aprovar pedido ${order.id.slice(0, 6)} para entrar na mesa?`);
    if (!ok) return;

    const { error } = await supabase
      .from('orders')
      .update({ approval_status: 'APPROVED', status: 'PENDING', approved_at: new Date().toISOString() })
      .eq('id', order.id);

    if (error) {
      toast(`Erro ao aprovar: ${error.message}`, 'error');
      return;
    }

    toast('Pedido aprovado na mesa.', 'success');
    fetchSessions();
  };

  const handleRejectOrder = async (order: Order) => {
    const ok = await confirm(`Rejeitar pedido ${order.id.slice(0, 6)}?`);
    if (!ok) return;

    const { error } = await supabase
      .from('orders')
      .update({ approval_status: 'REJECTED', status: 'CANCELLED' })
      .eq('id', order.id);

    if (error) {
      toast(`Erro ao rejeitar: ${error.message}`, 'error');
      return;
    }

    toast('Pedido rejeitado.', 'info');
    fetchSessions();
  };

  const handleMarkItemReady = async (orderId: string, itemId: string) => {
    const { error } = await supabase.from('order_items').update({ status: 'READY' }).eq('id', itemId);

    if (error) {
      toast(`Erro ao marcar item: ${error.message}`, 'error');
      return;
    }

    const { count } = await supabase
      .from('order_items')
      .select('*', { head: true, count: 'exact' })
      .eq('order_id', orderId)
      .eq('status', 'PENDING');

    const nextStatus: OrderStatus = (count || 0) === 0 ? 'READY' : 'PENDING';
    await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);

    toast('Item marcado como pronto.', 'success');
    fetchSessions();
  };

  const handleFinalizeSession = async (session: SessionAggregate) => {
    const ok = await confirm(`Finalizar ${session.table?.name || 'mesa'} e encerrar ciclo?`);
    if (!ok) return;

    const nowIso = new Date().toISOString();

    const { error: sessionError } = await supabase
      .from('sessions')
      .update({ status: 'EXPIRED', closed_at: nowIso })
      .eq('id', session.id);

    if (sessionError) {
      toast(`Erro ao finalizar mesa: ${sessionError.message}`, 'error');
      return;
    }

    await supabase.from('tables').update({ status: 'FREE' }).eq('id', session.table_id);
    await supabase
      .from('orders')
      .update({ status: 'FINISHED' })
      .eq('session_id', session.id)
      .eq('approval_status', 'APPROVED');

    await supabase
      .from('orders')
      .update({ status: 'CANCELLED', approval_status: 'REJECTED' })
      .eq('session_id', session.id)
      .eq('approval_status', 'PENDING_APPROVAL');

    setSelectedSessionId(null);
    toast('Mesa finalizada e liberada para novo ciclo.', 'success');
    fetchSessions();
  };

  const printSession = (session: SessionAggregate) => {
    const tableName = session.table?.name || 'Mesa';
    const createdAt = new Date(session.created_at).toLocaleString();
    const closedAt = session.closed_at ? new Date(session.closed_at).toLocaleString() : '-';
    const consolidated = getConsolidatedItems(session);
    const byGuest = getTotalsByGuest(session);
    const total = getSessionTotal(session);

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Comanda ${tableName}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
  .ticket { width: 80mm; margin: 0 auto; padding: 4mm; box-sizing: border-box; }
  h1 { font-size: 14px; margin: 0 0 6px 0; text-transform: uppercase; }
  .meta { font-size: 10px; margin-bottom: 8px; }
  .sep { border-top: 1px dashed #999; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; font-size: 11px; gap: 8px; }
  .small { font-size: 10px; color: #555; }
  .total { font-weight: bold; font-size: 13px; }
</style>
</head>
<body>
  <div class="ticket">
    <h1>Comanda ${tableName}</h1>
    <div class="meta">Abertura: ${createdAt}</div>
    <div class="meta">Fechamento: ${closedAt}</div>
    <div class="sep"></div>
    ${consolidated
      .map(
        (item) => `
      <div class="row"><span>${item.qty}x ${item.name}</span><span>${formatCurrency(item.total)}</span></div>
      ${item.notes.length ? `<div class="small">Obs: ${item.notes.join(' | ')}</div>` : ''}
      <div class="small">Pronto: ${item.ready} | Pendente: ${item.pending}</div>
      `
      )
      .join('')}
    <div class="sep"></div>
    <div class="total row"><span>Total Geral</span><span>${formatCurrency(total)}</span></div>
    <div class="sep"></div>
    ${byGuest
      .map((row) => `<div class="row"><span>${row.name}</span><span>${formatCurrency(row.total)}</span></div>`)
      .join('')}
  </div>
  <script>
    window.onload = () => { window.print(); window.onafterprint = () => window.close(); };
  <\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=440,height=800');
    if (!win) {
      toast('Nao foi possivel abrir a janela de impressao.', 'error');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const renderCards = () => {
    if (filteredSessions.length === 0) {
      return (
        <div className="col-span-full text-center py-20 text-gray-300 font-black uppercase tracking-widest text-[10px] flex flex-col items-center gap-4 italic">
          Nenhuma mesa encontrada nesta data
        </div>
      );
    }

    return filteredSessions.map((session) => {
      const peopleCount = session.guests?.length || 0;
      const itemCount = getSessionItemsCount(session);
      const total = getSessionTotal(session);
      const pendingApprovals = getPendingApprovals(session).length;

      return (
        <div key={session.id} className="bg-white border border-gray-200 rounded-[28px] overflow-hidden flex flex-col">
          <div className="p-5 bg-gray-50/50 border-b border-gray-100 flex justify-between items-start text-left">
            <div>
              <h3 className="font-black text-gray-800 text-lg uppercase tracking-tighter">{session.table?.name || 'Mesa'}</h3>
              <span className="text-[9px] text-gray-400 font-bold tracking-widest uppercase">
                Sessao #{session.id.slice(0, 6)} • {new Date(session.created_at).toLocaleTimeString()}
              </span>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-[8px] font-black tracking-widest border uppercase ${mode === 'ACTIVE' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {mode === 'ACTIVE' ? 'Ativa' : 'Finalizada'}
            </span>
          </div>

          <div className="p-5 flex-1 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Pessoas</p>
                <p className="text-lg font-black text-gray-800">{peopleCount}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Itens</p>
                <p className="text-lg font-black text-gray-800">{itemCount}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Total</p>
              <p className="text-xl font-black text-gray-900 tracking-tighter italic">{formatCurrency(total)}</p>
            </div>

            {pendingApprovals > 0 && mode === 'ACTIVE' && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-700 text-[10px] font-black uppercase tracking-widest">
                {pendingApprovals} pedido(s) aguardando aceite
              </div>
            )}
          </div>

          <div className="px-5 pb-5 flex gap-2">
            <button
              onClick={() => setSelectedSessionId(session.id)}
              className="flex-1 bg-gray-900 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest"
            >
              Visualizar
            </button>
            <button
              onClick={() => printSession(session)}
              className="flex-1 border border-gray-200 text-gray-600 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest"
            >
              Imprimir
            </button>
            {mode === 'ACTIVE' && (
              <button
                onClick={() => handleFinalizeSession(session)}
                className="flex-1 border border-green-200 bg-green-50 text-green-700 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest"
              >
                Finalizar Mesa
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  const selectedTotalsByGuest = selectedSession ? getTotalsByGuest(selectedSession) : [];
  const selectedTotal = selectedSession ? getSessionTotal(selectedSession) : 0;
  const selectedPendingApprovals = selectedSession ? getPendingApprovals(selectedSession) : [];
  const selectedConsolidated = selectedSession ? getConsolidatedItems(selectedSession) : [];

  const equalSplitValue = splitPeople > 0 ? selectedTotal / splitPeople : 0;

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {renderCards()}
      </div>

      {selectedSession && (
        <div className="fixed inset-0 z-[200] bg-gray-900/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-6xl bg-white rounded-t-[28px] sm:rounded-[30px] border border-gray-200 p-5 sm:p-8 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900">{selectedSession.table?.name || 'Mesa'}</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  {mode === 'ACTIVE' ? 'Mesa ativa' : 'Mesa finalizada'} • Pessoas: {selectedSession.guests?.length || 0}
                </p>
              </div>
              <button onClick={() => setSelectedSessionId(null)} className="text-gray-400 font-black">Fechar</button>
            </div>

            {mode === 'ACTIVE' && selectedPendingApprovals.length > 0 && (
              <div className="border border-amber-100 bg-amber-50 rounded-2xl p-4 flex flex-col gap-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-amber-700">Pedidos aguardando aceite</h4>
                {selectedPendingApprovals.map((order) => (
                  <div key={order.id} className="bg-white border border-amber-200 rounded-xl p-3 flex flex-wrap gap-2 items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-gray-800">Pedido #{order.id.slice(0, 6)}</p>
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                        {new Date(order.created_at).toLocaleTimeString()} • {formatCurrency(order.total_cents)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveOrder(order)} className="px-3 py-2 rounded-lg bg-green-600 text-white text-[10px] font-black uppercase tracking-widest">
                        Aceitar
                      </button>
                      <button onClick={() => handleRejectOrder(order)} className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest">
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              <section className="border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Consolidado de itens</h4>
                <div className="flex flex-col gap-2 max-h-[42vh] overflow-auto pr-1">
                  {selectedConsolidated.length === 0 && (
                    <p className="text-sm text-gray-400 font-bold">Sem itens confirmados.</p>
                  )}
                  {selectedConsolidated.map((row) => (
                    <div key={row.key} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex justify-between items-center">
                        <p className="font-black text-gray-800">{row.qty}x {row.name}</p>
                        <span className="font-black text-gray-900">{formatCurrency(row.total)}</span>
                      </div>
                      {row.notes.length > 0 && (
                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Obs: {row.notes.join(' | ')}</p>
                      )}
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                        Pronto: {row.ready} • Pendente: {row.pending}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Mosaico por pessoa</h4>
                <div className="grid md:grid-cols-2 gap-3 max-h-[42vh] overflow-auto pr-1">
                  {selectedTotalsByGuest.map((guestRow) => {
                    const guestItems = getConfirmedOrders(selectedSession)
                      .flatMap((order) => (order.items || []).map((item) => ({ ...item, orderId: order.id, orderStatus: order.status })))
                      .filter((item) => item.added_by_name === guestRow.name);

                    return (
                      <div key={guestRow.name} className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="font-black text-gray-800 uppercase tracking-widest text-[11px]">{guestRow.name}</p>
                          <span className="font-black text-gray-900">{formatCurrency(guestRow.total)}</span>
                        </div>
                        {guestItems.map((item, idx) => (
                          <div key={`${guestRow.name}-${idx}`} className="border border-gray-50 rounded-lg p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-black text-gray-700">{item.qty}x {item.name_snapshot}</span>
                              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${item.status === 'READY' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                {itemStatusLabel[(item.status || 'PENDING') as 'PENDING' | 'READY']}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{formatCurrency(item.qty * item.unit_price_cents)}</span>
                              {mode === 'ACTIVE' && item.status !== 'READY' && (
                                <button
                                  onClick={() => handleMarkItemReady(item.orderId, item.id)}
                                  className="px-2.5 py-1 rounded-lg bg-green-600 text-white text-[9px] font-black uppercase tracking-widest"
                                >
                                  Marcar pronto
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-3 items-end justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Dividir conta</h4>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Modo igual ou por consumo</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSplitMode('CONSUMPTION')}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest ${splitMode === 'CONSUMPTION' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    Por consumo
                  </button>
                  <button
                    onClick={() => setSplitMode('EQUAL')}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest ${splitMode === 'EQUAL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    Igual
                  </button>
                </div>
              </div>

              {splitMode === 'EQUAL' ? (
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Dividir em</label>
                    <input
                      type="number"
                      min={2}
                      value={splitPeople}
                      onChange={(e) => setSplitPeople(Math.max(2, Number(e.target.value) || 2))}
                      className="w-20 px-3 py-2 rounded-lg border border-gray-200 font-black"
                    />
                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">pessoas</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Valor por pessoa</p>
                    <p className="text-xl font-black text-primary tracking-tighter italic">{formatCurrency(equalSplitValue)}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedTotalsByGuest.map((row) => (
                    <div key={row.name} className="flex justify-between items-center text-sm">
                      <span className="font-black text-gray-600">{row.name}</span>
                      <span className="font-black text-gray-900">{formatCurrency(row.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Total geral da mesa</p>
                <p className="text-2xl font-black text-gray-900 tracking-tighter italic">{formatCurrency(selectedTotal)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => printSession(selectedSession)}
                  className="px-4 py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest"
                >
                  Imprimir Comanda
                </button>
                {mode === 'ACTIVE' && (
                  <button
                    onClick={() => handleFinalizeSession(selectedSession)}
                    className="px-4 py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    Finalizar Mesa
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminOrders;
