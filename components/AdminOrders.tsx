
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

type ReceiptPaperWidth = 58 | 80 | 'AUTO';
type ReceiptHeightOption = 'AUTO' | '220' | '300' | '500';

const getTodayInputDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatTicketNoteHtml = (note: string) => {
  const lines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  return lines
    .map((line) => {
      const labelMatch = line.match(/^([^:\n]{1,40}):\s*(.*)$/);
      if (!labelMatch) {
        return `<div class="small note-value">${escapeHtml(line)}</div>`;
      }

      const label = escapeHtml(labelMatch[1]);
      const text = escapeHtml(labelMatch[2]);
      return `<div class="small note-value"><span class="note-key">${label}:</span>${text ? ` ${text}` : ''}</div>`;
    })
    .join('');
};

const buildThermalLayout = (paperWidthMm: ReceiptPaperWidth) => {
  const isAutoWidth = paperWidthMm === 'AUTO';
  const compact = paperWidthMm === 58;
  const pageWidthMm = typeof paperWidthMm === 'number' ? paperWidthMm : null;
  return {
    compact,
    isAutoWidth,
    pageWidthMm,
    windowWidthPx: compact ? 420 : 540,
    windowHeightPx: compact ? 820 : 920,
    paddingTopMm: compact ? 3.2 : 4.4,
    paddingXmm: compact ? 2.6 : 3.8,
    paddingBottomMm: compact ? 4.2 : 5.6,
    lineHeight: compact ? 1.38 : 1.46,
    storeFontPx: compact ? 13 : 14,
    titleFontPx: compact ? 16 : 18,
    metaFontPx: compact ? 11 : 12,
    rowFontPx: compact ? 12 : 13,
    sectionFontPx: compact ? 11 : 12,
    totalFontPx: compact ? 16 : 18,
  };
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

const beep = () => {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 740;
    gain.gain.value = 0.02;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    osc.onended = () => ctx.close();
  } catch {
    // noop
  }
};

const AdminOrders: React.FC<AdminOrdersProps> = ({ mode }) => {
  const [sessions, setSessions] = useState<SessionAggregate[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayInputDate());
  const [splitMode, setSplitMode] = useState<'EQUAL' | 'CONSUMPTION'>('CONSUMPTION');
  const [splitPeople, setSplitPeople] = useState(2);
  const receiptPaperWidth: ReceiptPaperWidth = 'AUTO';
  const receiptHeight: ReceiptHeightOption = 'AUTO';
  const [storePrintMeta, setStorePrintMeta] = useState<{ store_name?: string } | null>(null);
  const lastNotificationRef = useRef<string>('');

  const { toast, confirm } = useFeedback();

  const notifyAdmin = async (title: string, body: string, tag: string) => {
    const key = `${title}:${body}:${tag}`;
    if (lastNotificationRef.current === key) return;
    lastNotificationRef.current = key;
    setTimeout(() => {
      if (lastNotificationRef.current === key) lastNotificationRef.current = '';
    }, 1500);

    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission !== 'granted') return;
      new Notification(title, { body, tag });
    } catch {
      // noop
    }
  };

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
    const fetchPrintMeta = async () => {
      const { data } = await supabase.from('settings').select('store_name').eq('id', 1).maybeSingle();
      if (data) {
        setStorePrintMeta(data as { store_name?: string });
      }
    };
    fetchPrintMeta();
  }, []);

  useEffect(() => {
    fetchSessions();

    const channel = supabase
      .channel(`admin_tables_${mode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, fetchSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        fetchSessions();
        if (mode !== 'ACTIVE') return;
        const row = (payload.new || payload.old || {}) as any;
        if (payload.eventType === 'INSERT') {
          beep();
          if (row.approval_status === 'PENDING_APPROVAL') {
            toast('Novo pedido aguardando aceite.', 'info');
            await notifyAdmin('Novo pedido', 'Pedido aguardando aceite na mesa.', `order-pending-${row.id}`);
          } else {
            toast('Novo pedido entrou em uma mesa ativa.', 'info');
            await notifyAdmin('Novo pedido', 'Pedido confirmado na mesa ativa.', `order-insert-${row.id}`);
          }
        }
        if (payload.eventType === 'UPDATE' && row.status === 'READY') {
          beep();
          toast('Pedido marcado como pronto.', 'success');
          await notifyAdmin('Pedido pronto', 'Um pedido foi marcado como pronto.', `order-ready-${row.id}`);
        }
      })
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

  const getConfirmedOrders = (session: SessionAggregate) => {
    return getVisibleOrders(session).filter((order) => order.approval_status === 'APPROVED');
  };

  const getSessionTotal = (session: SessionAggregate) => {
    return getConfirmedOrders(session)
      .filter((order) => order.status !== 'CANCELLED')
      .reduce((acc, order) => acc + order.total_cents, 0);
  };

  const getSessionItemsCount = (session: SessionAggregate) => {
    return getVisibleOrders(session)
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

  const getConsolidatedItems = (orders: (Order & { items?: OrderItem[] })[]) => {
    const map = new Map<string, { qty: number; total: number; notes: string[]; ready: number; pending: number }>();

    orders
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

  const printSession = async (session: SessionAggregate) => {
    const tableName = session.table?.name || 'Mesa';
    const createdAt = new Date(session.created_at).toLocaleString('pt-BR');
    const closedAt = session.closed_at ? new Date(session.closed_at).toLocaleString('pt-BR') : '-';
    const visibleOrders = getVisibleOrders(session);
    const byGuest = getTotalsByGuest(session);
    const total = getSessionTotal(session);

    const layout = buildThermalLayout(receiptPaperWidth);
    const pageHeightCss = receiptHeight === 'AUTO' ? 'auto' : `${receiptHeight}mm`;
    const pageSizeCss = layout.isAutoWidth ? 'auto' : `${layout.pageWidthMm}mm ${pageHeightCss}`;
    const ticketWidthCss = layout.isAutoWidth ? '100%' : `${layout.pageWidthMm}mm`;
    const popupHeightPx =
      receiptHeight === 'AUTO'
        ? layout.windowHeightPx
        : Math.max(layout.windowHeightPx, Math.round(Number(receiptHeight) * 3.78) + 120);

    const storeName = escapeHtml((storePrintMeta?.store_name || 'Parada do Lanche').trim());

    const ordersHtml = visibleOrders
      .map((order) => {
        const orderTime = new Date(order.created_at).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const itemsHtml = (order.items || [])
          .map(
            (item) => `
      <div class="item-line">
        <span class="label-col">${escapeHtml(`${item.qty}x ${item.name_snapshot}`)}</span>
        <span class="value-col">${formatCurrency(item.qty * item.unit_price_cents)}</span>
      </div>
      <div class="small muted">${escapeHtml(`Por: ${item.added_by_name}`)}</div>
      ${item.note ? `<div class="small note-title">Observacao:</div>${formatTicketNoteHtml(item.note)}` : ''}`
          )
          .join('');

        return `
      <div class="row">
        <strong class="label-col">Pedido #${escapeHtml(order.id.slice(0, 6))}</strong>
        <span class="value-col">${formatCurrency(order.total_cents)}</span>
      </div>
      <div class="small muted">${escapeHtml(
        `${approvalLabel[order.approval_status || 'APPROVED'] || 'Confirmado'} • ${orderTime}`
      )}</div>
      ${itemsHtml}
      <div class="sep"></div>`;
      })
      .join('');

    const byGuestHtml = byGuest
      .map(
        (row) => `
      <div class="row">
        <span class="label-col">${escapeHtml(row.name)}</span>
        <span class="value-col">${formatCurrency(row.total)}</span>
      </div>`
      )
      .join('');

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Comanda ${escapeHtml(tableName)}</title>
<style>
  @page { size: ${pageSizeCss}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; color: #000; background: #fff; }
  body { font-family: "Arial", "Helvetica", sans-serif; line-height: ${layout.lineHeight}; font-size: ${layout.rowFontPx}px; }
  .ticket {
    width: ${ticketWidthCss};
    min-height: ${pageHeightCss};
    margin: 0 auto;
    padding: ${layout.paddingTopMm}mm ${layout.paddingXmm}mm ${layout.paddingBottomMm}mm;
  }
  .store { margin: 0 0 1.8mm; text-align: center; font-size: ${layout.storeFontPx}px; font-weight: 800; letter-spacing: 0.02em; word-break: break-word; }
  h1 {
    margin: 0 0 1.8mm;
    font-size: ${layout.titleFontPx}px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    word-break: break-word;
  }
  .meta { font-size: ${layout.metaFontPx}px; margin-bottom: 1.2mm; }
  .meta-line { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .meta-line span:first-child { color: #333; }
  .meta-line span:last-child { text-align: right; white-space: nowrap; font-weight: 700; }
  .sep { border-top: 1px dashed #777; margin: 2.2mm 0; }
  .section-title {
    margin: 0 0 1mm;
    font-size: ${layout.sectionFontPx}px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .row, .item-line {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 7px;
    font-size: ${layout.rowFontPx}px;
    margin-bottom: 0.6mm;
  }
  .label-col { flex: 1; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
  .value-col { white-space: nowrap; margin-left: 4px; font-weight: 700; }
  .small { font-size: ${layout.metaFontPx}px; margin: 0.3mm 0 0.7mm; word-break: break-word; overflow-wrap: anywhere; }
  .small.muted { color: #444; }
  .small.note-title { color: #111; margin-bottom: 0.1mm; font-weight: 400; }
  .small.note-value { color: #111; margin-top: 0; padding-left: 0; }
  .note-key { font-weight: 800; }
  .total { font-size: ${layout.totalFontPx}px; font-weight: 800; margin-top: 0.8mm; }
  .footer {
    margin-top: 3.4mm;
    text-align: center;
    font-size: ${layout.metaFontPx + 1}px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .footer-sep {
    border-top: 1px solid #000;
    margin: 3.1mm 0 1.8mm;
  }
</style>
</head>
<body>
  <div class="ticket">
    <p class="store">${storeName}</p>
    <h1>Comanda ${escapeHtml(tableName)}</h1>
    <div class="meta meta-line"><span>Abertura</span><span>${escapeHtml(createdAt)}</span></div>
    <div class="meta meta-line"><span>Fechamento</span><span>${escapeHtml(closedAt)}</span></div>
    <div class="sep"></div>
    ${ordersHtml}
    <div class="total row"><span class="label-col">Total Geral</span><span class="value-col">${formatCurrency(total)}</span></div>
    <div class="sep"></div>
    <div class="section-title">Por pessoa</div>
    ${byGuestHtml}
    <div class="footer-sep"></div>
    <div class="footer">UaiTech</div>
  </div>
  <script>
    window.onload = () => {
      window.print();
      window.onafterprint = () => window.close();
    };
  <\/script>
</body>
</html>`;

    const win = window.open('', '_blank', `width=${layout.windowWidthPx},height=${popupHeightPx}`);
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
  const selectedVisibleOrders = selectedSession ? getVisibleOrders(selectedSession) : [];
  const selectedConsolidated = selectedSession ? getConsolidatedItems(selectedVisibleOrders) : [];

  const finishedRevenueTotal = useMemo(() => {
    if (mode !== 'FINISHED') return 0;
    return filteredSessions.reduce((acc, session) => acc + getSessionTotal(session), 0);
  }, [mode, filteredSessions]);

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

            <section className="border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Pedidos da mesa (individuais)</h4>
              <div className="flex flex-col gap-2 max-h-[32vh] overflow-auto pr-1">
                {selectedVisibleOrders.length === 0 && (
                  <p className="text-sm text-gray-400 font-bold">Nenhum pedido enviado.</p>
                )}
                {selectedVisibleOrders.map((order) => (
                  <div key={order.id} className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-black text-gray-800">
                        Pedido #{order.id.slice(0, 6)} • {new Date(order.created_at).toLocaleTimeString()}
                      </p>
                      <div className="flex gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${approvalClass[order.approval_status || 'APPROVED'] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {approvalLabel[order.approval_status || 'APPROVED'] || 'Confirmado'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${orderStatusClass[order.status]}`}>
                          {orderStatusLabel[order.status]}
                        </span>
                      </div>
                    </div>
                    {(order.items || []).map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-2 border-t border-gray-50 pt-2">
                        <div>
                          <p className="font-black text-gray-700 text-sm">{item.qty}x {item.name_snapshot}</p>
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                            Pedido por {item.added_by_name}
                          </p>
                          {item.note && <p className="text-[10px] text-gray-500 font-black mt-1">{item.note}</p>}
                        </div>
                        <span className="font-black text-gray-800 text-sm">{formatCurrency(item.qty * item.unit_price_cents)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

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
