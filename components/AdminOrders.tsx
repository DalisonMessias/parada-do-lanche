
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { buildReceiptUrlFromToken, printKitchenTicket } from '../services/kitchenPrint';
import { groupOrderItems } from '../services/orderItemGrouping';
import { Guest, Order, OrderItem, OrderStatus, Session, StoreSettings } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import AppModal from './ui/AppModal';

type AdminOrdersMode = 'ACTIVE' | 'FINISHED';

type SessionAggregate = Session & {
  table?: { name: string; table_type?: string } | null;
  guests?: Guest[];
  orders?: (Order & { items?: OrderItem[] })[];
};

interface AdminOrdersProps {
  mode: AdminOrdersMode;
  settings: StoreSettings | null;
}

type PrintScope = 'ALL' | 'UNPRINTED' | 'ORDER';

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

type OrderGroup = {
  groupId: string;
  rootOrder: Order & { items?: OrderItem[] };
  orders: (Order & { items?: OrderItem[] })[];
};

const groupOrdersByRoot = (orders: (Order & { items?: OrderItem[] })[]): OrderGroup[] => {
  const grouped = new Map<string, (Order & { items?: OrderItem[] })[]>();

  for (const order of orders) {
    const key = order.parent_order_id || order.id;
    const bucket = grouped.get(key) || [];
    bucket.push(order);
    grouped.set(key, bucket);
  }

  const groups: OrderGroup[] = [];
  for (const [groupId, bucket] of grouped.entries()) {
    const sorted = [...bucket].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const rootOrder = sorted.find((order) => order.id === groupId) || sorted[0];
    groups.push({ groupId, rootOrder, orders: sorted });
  }

  return groups.sort(
    (a, b) => new Date(b.rootOrder.created_at).getTime() - new Date(a.rootOrder.created_at).getTime()
  );
};

const approvalLabel: Record<string, string> = {
  PENDING_APPROVAL: 'Aguardando aceite',
  APPROVED: 'Confirmado',
  REJECTED: 'Rejeitado',
};

const approvalClass: Record<string, string> = {
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-100',
  APPROVED: 'bg-green-50 text-green-700 border-green-100',
  REJECTED: 'bg-red-50 text-red-700 border-red-100',
};

const serviceTypeLabel = (serviceType?: string | null) => {
  if (serviceType === 'ENTREGA') return 'Entrega';
  if (serviceType === 'RETIRADA') return 'Retirada';
  return 'Mesa';
};

type SessionCardType = 'MESA' | 'BALCAO' | 'RETIRADA' | 'ENTREGA';

const getTicketTypeFromOrder = (order?: Order | null): SessionCardType => {
  if (!order) return 'MESA';
  if (order.service_type === 'ENTREGA') return 'ENTREGA';
  if (order.service_type === 'RETIRADA') return 'RETIRADA';
  if (order.origin === 'BALCAO') return 'BALCAO';
  return 'MESA';
};

const shouldHaveReceiptToken = (type: SessionCardType) => type === 'ENTREGA' || type === 'RETIRADA';

const getTicketStatusLabel = (order: Order) => {
  if (order.approval_status === 'PENDING_APPROVAL') return 'Aguardando aceite';
  if (order.approval_status === 'REJECTED') return 'Rejeitado';
  if (order.status === 'PREPARING') return 'Em preparo';
  if (order.status === 'READY') return 'Pronto';
  if (order.status === 'FINISHED') return 'Finalizado';
  if (order.status === 'CANCELLED') return 'Cancelado';
  return 'Confirmado';
};

const getDeliveryLines = (order: Order) => {
  const address = order.delivery_address;
  if (!address) return [];

  const firstLine = [address.street, address.number].filter(Boolean).join(', ');
  const secondLine = [address.neighborhood].filter(Boolean).join(' - ');
  const thirdLine = [address.complement, address.reference].filter(Boolean).join(' | ');

  return [firstLine, secondLine, thirdLine].filter((line) => !!line);
};

const AdminOrders: React.FC<AdminOrdersProps> = ({ mode, settings }) => {
  const [sessions, setSessions] = useState<SessionAggregate[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [seenOrderIdsBySession, setSeenOrderIdsBySession] = useState<Record<string, string[]>>({});
  const [selectedDate, setSelectedDate] = useState<string>(getTodayInputDate());
  const [splitMode, setSplitMode] = useState<'EQUAL' | 'CONSUMPTION'>('CONSUMPTION');
  const [splitPeople, setSplitPeople] = useState(2);
  const initializedSeenRef = useRef(false);

  const { toast, confirm } = useFeedback();
  const waiterFeeEnabled = settings?.enable_waiter_fee === true;
  const waiterFeeMode = settings?.waiter_fee_mode === 'FIXED' ? 'FIXED' : 'PERCENT';
  const waiterFeeRawValue = Number(settings?.waiter_fee_value ?? (waiterFeeMode === 'PERCENT' ? 10 : 0));
  const waiterFeePercent = Math.min(100, Math.max(0, waiterFeeRawValue));
  const waiterFeeFixedCents = Math.max(0, waiterFeeRawValue);

  const markOrdersAsSeen = useCallback((sessionId: string, orderIds: string[]) => {
    if (!sessionId || orderIds.length === 0) return;
    setSeenOrderIdsBySession((prev) => {
      const current = prev[sessionId] || [];
      const set = new Set(current);
      let changed = false;
      orderIds.forEach((id) => {
        if (!set.has(id)) {
          set.add(id);
          changed = true;
        }
      });
      if (!changed) return prev;
      return { ...prev, [sessionId]: Array.from(set) };
    });
  }, []);

  const fetchSessions = async () => {
    const statusFilter = mode === 'ACTIVE' ? 'OPEN' : 'EXPIRED';

    const { data, error } = await supabase
      .from('sessions')
      .select('*, table:tables(name,table_type), guests:session_guests(*), orders:orders(*, items:order_items(*))')
      .eq('status', statusFilter)
      .order('created_at', { ascending: false });

    if (error) {
      toast(`Erro ao buscar mesas: ${error.message}`, 'error');
      return;
    }

    const normalized = (data || []).map(normalizeSession);
    setSessions(normalized);

    if (!initializedSeenRef.current) {
      const baseline: Record<string, string[]> = {};
      normalized.forEach((session) => {
        baseline[session.id] = (session.orders || [])
          .filter((order) => order.approval_status !== 'REJECTED')
          .map((order) => order.id);
      });
      setSeenOrderIdsBySession(baseline);
      initializedSeenRef.current = true;
    }
  };

  useEffect(() => {
    initializedSeenRef.current = false;
    setSeenOrderIdsBySession({});
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
  const getVisibleOrders = (session: SessionAggregate) => {
    return (session.orders || []).filter((order) => order.approval_status !== 'REJECTED');
  };

  const getConfirmedOrdersFrom = (orders: (Order & { items?: OrderItem[] })[]) => {
    return orders.filter((order) => order.approval_status === 'APPROVED' && order.status !== 'CANCELLED');
  };

  const getOrdersTotal = (orders: (Order & { items?: OrderItem[] })[]) => {
    return getConfirmedOrdersFrom(orders).reduce((acc, order) => acc + order.total_cents, 0);
  };

  const getWaiterFeeCents = (subtotalCents: number) => {
    if (!waiterFeeEnabled) return 0;
    if (waiterFeeMode === 'FIXED') return waiterFeeFixedCents;
    return Math.round(subtotalCents * (waiterFeePercent / 100));
  };

  const getSessionTotal = (session: SessionAggregate) => {
    const subtotal = getOrdersTotal(getVisibleOrders(session));
    return subtotal + getWaiterFeeCents(subtotal);
  };

  const getPendingApprovals = (session: SessionAggregate) => {
    return (session.orders || []).filter((order) => order.approval_status === 'PENDING_APPROVAL');
  };

  const getUnprintedOrders = (session: SessionAggregate) => {
    return getVisibleOrders(session).filter((order) => !order.printed_at);
  };

  const getNewOrders = (session: SessionAggregate) => {
    const seen = new Set(seenOrderIdsBySession[session.id] || []);
    return getVisibleOrders(session).filter((order) => !seen.has(order.id));
  };

  const getTotalsByGuestFromOrders = (orders: (Order & { items?: OrderItem[] })[]) => {
    const map = new Map<string, { total: number; items: number }>();

    getConfirmedOrdersFrom(orders).forEach((order) => {
      (order.items || []).forEach((item) => {
        const key = order.origin === 'CUSTOMER'
          ? (item.added_by_name || 'Cliente')
          : 'Atendimento interno';
        const row = map.get(key) || { total: 0, items: 0 };
        row.total += item.qty * item.unit_price_cents;
        row.items += item.qty;
        map.set(key, row);
      });
    });

    return Array.from(map.entries()).map(([name, row]) => ({ name, total: row.total, items: row.items }));
  };

  const getTotalsByGuest = (session: SessionAggregate) => {
    return getTotalsByGuestFromOrders(getVisibleOrders(session));
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

    if (order.created_by_guest_id) {
      const { error: cartError } = await supabase
        .from('cart_items')
        .delete()
        .eq('session_id', order.session_id)
        .eq('guest_id', order.created_by_guest_id);

      if (cartError) {
        toast(`Pedido aprovado, mas nao foi possivel limpar carrinho: ${cartError.message}`, 'error');
      }
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

  const handleFinalizeSession = async (session: SessionAggregate) => {
    const ok = await confirm(`Finalizar ${session.table?.name || 'mesa'} e encerrar ciclo?`);
    if (!ok) return;

    const nowIso = new Date().toISOString();

    let { error: sessionError } = await supabase
      .from('sessions')
      .update({ status: 'EXPIRED', closed_at: nowIso })
      .eq('id', session.id);

    if (sessionError && /closed_at/i.test(sessionError.message || '')) {
      const retry = await supabase
        .from('sessions')
        .update({ status: 'EXPIRED' })
        .eq('id', session.id);
      sessionError = retry.error;

      if (!sessionError) {
        toast('Mesa finalizada sem campo closed_at (atualize o SQL unificado no banco).', 'info');
      }
    }

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

  const printSession = async (
    session: SessionAggregate,
    options: { scope?: PrintScope; orderId?: string } = {}
  ) => {
    const scope = options.scope || 'ALL';
    const visibleOrders = getVisibleOrders(session);
    const printableOrders =
      scope === 'ORDER' && options.orderId
        ? visibleOrders.filter((order) => order.id === options.orderId)
        : scope === 'UNPRINTED'
          ? visibleOrders.filter((order) => !order.printed_at)
          : visibleOrders;

    if (printableOrders.length === 0) {
      toast('Nao ha pedidos para imprimir neste filtro.', 'info');
      return;
    }

    let printableOrdersWithToken = printableOrders;
    try {
      printableOrdersWithToken = await Promise.all(
        printableOrders.map(async (order) => {
          const ticketType = getTicketTypeFromOrder(order);
          if (!shouldHaveReceiptToken(ticketType)) return order;

          const existingToken = (order.receipt_token || '').trim();
          if (existingToken) {
            return {
              ...order,
              receipt_token: existingToken,
            };
          }

          const { data, error } = await supabase.rpc('ensure_order_receipt_token', {
            p_order_id: order.id,
          });
          if (error) {
            throw new Error(error.message || `Falha ao gerar token do cupom para o pedido ${order.id.slice(0, 6)}.`);
          }

          const generatedToken = String(data || '').trim();
          if (!generatedToken) {
            throw new Error(`Nao foi possivel gerar token do cupom para o pedido ${order.id.slice(0, 6)}.`);
          }

          return {
            ...order,
            receipt_token: generatedToken,
          };
        })
      );
    } catch (error: any) {
      toast(error?.message || 'Falha ao preparar tokens de cupom digital.', 'error');
      return;
    }

    const printResult = await printKitchenTicket({
      tickets: printableOrdersWithToken.map((order) => {
        const ticketType = getTicketTypeFromOrder(order);
        const fallbackSubtotal = (order.items || []).reduce(
          (acc, item) => acc + (item.qty || 0) * (item.unit_price_cents || 0),
          0
        );
        const subtotalCents = Number(order.subtotal_cents ?? fallbackSubtotal);
        const serviceFeeCents = ticketType === 'MESA' ? getWaiterFeeCents(subtotalCents) : 0;
        const deliveryFeeCents = Number(order.delivery_fee_cents || 0);
        const totalCentsResolved =
          Number(order.total_cents) ||
          Math.max(0, subtotalCents + serviceFeeCents + (ticketType === 'ENTREGA' ? deliveryFeeCents : 0));

        return {
          storeName: 'Parada do Lanche',
          storeImageUrl: settings?.logo_url || null,
          orderId: order.id,
          ticketType,
          openedAt: order.created_at || session.created_at,
          closedAt: session.closed_at || null,
          statusLabel: getTicketStatusLabel(order),
          orderTime: new Date(order.created_at || session.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          tableName: session.table?.name || 'Mesa',
          customerName: order.customer_name || null,
          customerPhone: order.customer_phone || null,
          deliveryAddress: order.delivery_address || null,
          items: (order.items || []).map((item) => ({
            name_snapshot: item.name_snapshot,
            qty: item.qty || 0,
            unit_price_cents: item.unit_price_cents || 0,
            note: item.note || '',
          })),
          subtotalCents,
          serviceFeeCents,
          deliveryFeeCents,
          totalCents: totalCentsResolved,
          receiptToken: shouldHaveReceiptToken(ticketType) ? order.receipt_token || null : null,
          receiptUrl:
            shouldHaveReceiptToken(ticketType) && (order.receipt_token || '').trim()
              ? buildReceiptUrlFromToken((order.receipt_token || '').trim())
              : null,
        };
      }),
    });

    if (printResult.status === 'error') {
      toast(`Nao foi possivel iniciar a impressao: ${printResult.message}`, 'error');
      return;
    }
    if (printResult.status === 'cancelled') {
      toast('Impressao cancelada. Nenhum cupom foi marcado como impresso.', 'info');
      return;
    }

    const { error: markError } = await supabase.rpc('mark_orders_printed', {
      p_session_id: session.id,
      p_order_ids: printableOrders.map((order) => order.id),
    });

    if (markError) {
      toast(`Impresso, mas falhou ao marcar como impresso: ${markError.message}`, 'error');
      return;
    }

    fetchSessions();
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
      const visibleOrders = [...getVisibleOrders(session)].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latestOrder = visibleOrders[0] || null;
      const tableType = session.table?.table_type || 'DINING';
      const cardType: SessionCardType =
        tableType === 'COUNTER'
          ? latestOrder
            ? getTicketTypeFromOrder(latestOrder)
            : 'BALCAO'
          : 'MESA';
      const cardTypeLabel =
        cardType === 'ENTREGA'
          ? 'Entrega'
          : cardType === 'RETIRADA'
            ? 'Retirada'
            : cardType === 'BALCAO'
              ? 'Balcao'
              : 'Mesa';
      const referenceOrderId = latestOrder?.id || null;
      const referenceTime = latestOrder?.created_at || session.created_at;
      const total = getSessionTotal(session);
      const pendingApprovals = getPendingApprovals(session).length;
      const newOrdersCount = getNewOrders(session).length;
      const unprintedCount = getUnprintedOrders(session).length;
      const shortAddress =
        cardType === 'ENTREGA' && latestOrder?.delivery_address
          ? [latestOrder.delivery_address.street, latestOrder.delivery_address.number, latestOrder.delivery_address.neighborhood]
              .filter(Boolean)
              .join(' - ')
          : '';

      return (
        <div key={session.id} className="bg-white border border-gray-200 rounded-[28px] overflow-hidden flex flex-col">
          <div className="p-5 bg-gray-50/50 border-b border-gray-100 flex justify-between items-start text-left">
            <div>
              <h3 className="font-black text-gray-800 text-lg uppercase tracking-tighter">
                {cardType === 'MESA' ? (session.table?.name || 'Mesa') : cardTypeLabel}
              </h3>
              <span className="text-[9px] text-gray-400 font-bold tracking-widest uppercase">
                {referenceOrderId ? `Pedido #${referenceOrderId.slice(0, 6)}` : `Sessao #${session.id.slice(0, 6)}`} • {new Date(referenceTime).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="px-3 py-1.5 rounded-full text-[8px] font-black tracking-widest border uppercase bg-slate-50 text-slate-700 border-slate-200">
                {cardTypeLabel}
              </span>
              <span className={`px-3 py-1.5 rounded-full text-[8px] font-black tracking-widest border uppercase ${mode === 'ACTIVE' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                {mode === 'ACTIVE' ? 'Ativa' : 'Finalizada'}
              </span>
              {mode === 'ACTIVE' && newOrdersCount > 0 && (
                <span className="px-2 py-1 rounded-full bg-red-600 text-white text-[8px] font-black uppercase tracking-widest">
                  {newOrdersCount} novo(s)
                </span>
              )}
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Status</p>
                <p className="text-sm font-black text-gray-800 uppercase">{mode === 'ACTIVE' ? 'Ativa' : 'Finalizada'}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Horario</p>
                <p className="text-sm font-black text-gray-800">{new Date(referenceTime).toLocaleTimeString('pt-BR')}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Total</p>
              <p className="text-xl font-black text-gray-900 tracking-tighter italic">{formatCurrency(total)}</p>
            </div>

            {cardType === 'ENTREGA' && shortAddress && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-blue-500">Endereco</p>
                <p className="text-[11px] font-black text-blue-700">{shortAddress}</p>
              </div>
            )}

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
              onClick={() => printSession(session, { scope: 'UNPRINTED' })}
              disabled={unprintedCount === 0}
              className="flex-1 border border-gray-200 text-gray-600 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Imprimir Novos
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
  const selectedSubtotal = selectedSession ? getOrdersTotal(getVisibleOrders(selectedSession)) : 0;
  const selectedWaiterFee = getWaiterFeeCents(selectedSubtotal);
  const selectedWaiterFeeLabel =
    waiterFeeMode === 'FIXED' ? 'Taxa do garcom (valor fixo)' : `Taxa do garcom (${waiterFeePercent}%)`;
  const selectedTotal = selectedSubtotal + selectedWaiterFee;
  const selectedPendingApprovals = selectedSession ? getPendingApprovals(selectedSession) : [];
  const selectedVisibleOrders = selectedSession ? getVisibleOrders(selectedSession) : [];
  const selectedOrderGroups = useMemo(
    () => groupOrdersByRoot(selectedVisibleOrders),
    [selectedVisibleOrders]
  );
  const selectedUnprintedCount = selectedSession ? getUnprintedOrders(selectedSession).length : 0;

  useEffect(() => {
    if (!selectedSession) return;
    markOrdersAsSeen(
      selectedSession.id,
      selectedVisibleOrders.map((order) => order.id)
    );
  }, [selectedSession, selectedVisibleOrders, markOrdersAsSeen]);

  const finishedRevenueTotal = useMemo(() => {
    if (mode !== 'FINISHED') return 0;
    return filteredSessions.reduce((acc, session) => acc + getSessionTotal(session), 0);
  }, [mode, filteredSessions]);

  const equalSplitValue = splitPeople > 0 ? selectedTotal / splitPeople : 0;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-[9px] mr-4 font-black uppercase tracking-widest text-gray-400">Filtrar por data</label>
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

      {mode === 'FINISHED' && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Soma total de ganhos das mesas</p>
          <p className="text-3xl font-black tracking-tighter text-emerald-800 mt-2 italic">{formatCurrency(finishedRevenueTotal)}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {renderCards()}
      </div>

      {selectedSession && (
        <AppModal
          open={!!selectedSession}
          onClose={() => setSelectedSessionId(null)}
          title={
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900">{selectedSession.table?.name || 'Mesa'}</h3>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                {mode === 'ACTIVE' ? 'Mesa ativa' : 'Mesa finalizada'} • Pessoas: {selectedSession.guests?.length || 0}
              </p>
            </div>
          }
          size="xl"
          zIndex={200}
          bodyClassName="space-y-6"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => printSession(selectedSession, { scope: 'UNPRINTED' })}
                disabled={selectedUnprintedCount === 0}
                className="px-4 py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Imprimir Novos
              </button>
              <button
                onClick={() => printSession(selectedSession, { scope: 'ALL' })}
                className="px-4 py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest"
              >
                Imprimir Todos
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
          }
        >

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

            <section className="border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Pedidos da mesa (individuais)</h4>
              <div className="flex flex-col gap-2 max-h-[32vh] overflow-auto pr-1">
                {selectedVisibleOrders.length === 0 && (
                  <p className="text-sm text-gray-400 font-bold">Nenhum pedido enviado.</p>
                )}
                {selectedOrderGroups.map((group) => (
                  <div key={group.groupId} className="border border-gray-100 rounded-xl p-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-gray-800">
                        Pedido:  #{group.rootOrder.id.slice(0, 6)} | {new Date(group.rootOrder.created_at).toLocaleTimeString()}
                      </p>
                      <button
                        onClick={() => selectedSession && printSession(selectedSession, { scope: 'ORDER', orderId: group.rootOrder.id })}
                        className="px-2 py-0.5 rounded-full border border-gray-200 text-[9px] font-black uppercase tracking-widest text-gray-600"
                      >
                        Imprimir
                      </button>
                    </div>

                    {group.orders.map((order) => (
                      <div key={order.id} className="border border-gray-100 rounded-lg p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-black text-gray-700">
                            Pedido:  #{order.id.slice(0, 6)} | {new Date(order.created_at).toLocaleTimeString()}
                          </p>
                          <div className="flex gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${approvalClass[order.approval_status || 'APPROVED'] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                              {approvalLabel[order.approval_status || 'APPROVED'] || 'Confirmado'}
                            </span>
                            {order.status !== 'PENDING' && (
                              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${orderStatusClass[order.status]}`}>
                                {orderStatusLabel[order.status]}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest bg-slate-50 border-slate-200 text-slate-600">
                              {serviceTypeLabel(order.service_type)}
                            </span>
                            <button
                              onClick={() => selectedSession && printSession(selectedSession, { scope: 'ORDER', orderId: order.id })}
                              className="px-2 py-0.5 rounded-full border border-gray-200 text-[9px] font-black uppercase tracking-widest text-gray-600"
                            >
                              Imprimir
                            </button>
                          </div>
                        </div>
                        {(order.service_type === 'RETIRADA' || order.service_type === 'ENTREGA') && (
                          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 space-y-1.5">
                            <p className="text-[10px] text-blue-700 font-black uppercase tracking-widest">
                              {serviceTypeLabel(order.service_type)}
                            </p>
                            {order.customer_name && (
                              <p className="text-[10px] text-blue-800 font-black">Cliente: {order.customer_name}</p>
                            )}
                            {order.customer_phone && (
                              <p className="text-[10px] text-blue-700 font-black">Telefone: {order.customer_phone}</p>
                            )}
                            {order.service_type === 'ENTREGA' &&
                              getDeliveryLines(order).map((line, index) => (
                                <p key={`${order.id}-delivery-${index}`} className="text-[10px] text-blue-700 font-black">
                                  {line}
                                </p>
                              ))}
                            {order.service_type === 'ENTREGA' && (order.delivery_fee_cents || 0) > 0 && (
                              <p className="text-[10px] text-blue-700 font-black">
                                Taxa de entrega: {formatCurrency(order.delivery_fee_cents || 0)}
                              </p>
                            )}
                          </div>
                        )}
                        {groupOrderItems(order.items || []).map((item, index) => (
                          <div key={`${order.id}-${item.id || index}`} className="flex items-start justify-between gap-2 border-t border-gray-50 pt-2">
                            <div>
                              <p className="font-black text-gray-700 text-sm">{item.qty}x {item.name_snapshot}</p>
                              {Number((item as any).promo_discount_cents || 0) > 0 && (
                                <p className="text-[10px] text-emerald-600 font-black mt-1">
                                  Promocao {((item as any).promo_name || '').trim() ? `(${(item as any).promo_name})` : ''}: -{formatCurrency(Number((item as any).promo_discount_cents || 0))}
                                </p>
                              )}
                              {item.note && <p className="text-[10px] text-gray-500 font-black mt-1 whitespace-pre-line">{item.note}</p>}
                            </div>
                            <span className="font-black text-gray-800 text-sm">{formatCurrency(item.qty * item.unit_price_cents)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

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
                    Paganto unico
                  </button>
                  <button
                    onClick={() => setSplitMode('EQUAL')}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest ${splitMode === 'EQUAL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    Dividir conta
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
                    <div key={row.name} className="flex justify-between items-start text-sm">
                      <div className="flex flex-col">
                        <span className="font-black text-gray-600">{row.name}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                          {row.items} item(ns)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-gray-900">{formatCurrency(row.total)}</span>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                          {selectedSubtotal > 0 ? `${Math.round((row.total / selectedSubtotal) * 100)}% da mesa` : '0% da mesa'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {splitMode === 'EQUAL' && selectedTotalsByGuest.length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                    Consumo individual (referencia)
                  </p>
                  {selectedTotalsByGuest.map((row) => (
                    <div key={`equal-${row.name}`} className="flex justify-between items-center text-sm">
                      <span className="font-black text-gray-600">{row.name}</span>
                      <span className="font-black text-gray-900">{formatCurrency(row.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Subtotal da mesa</p>
                <p className="text-xl font-black text-gray-900 tracking-tighter italic">{formatCurrency(selectedSubtotal)}</p>
                {waiterFeeEnabled && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">
                    {selectedWaiterFeeLabel}: + {formatCurrency(selectedWaiterFee)}
                  </p>
                )}
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-2">Total geral da mesa</p>
                <p className="text-2xl font-black text-gray-900 tracking-tighter italic">{formatCurrency(selectedTotal)}</p>
                {selectedTotalsByGuest.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {selectedTotalsByGuest.map((row) => (
                      <p key={`total-${row.name}`} className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        {row.name}: {formatCurrency(row.total)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
        </AppModal>
      )}
    </>
  );
};

export default AdminOrders;
