import { formatCurrency } from './supabase';

export type KitchenPrintItem = {
  name_snapshot: string;
  qty: number;
  unit_price_cents: number;
  note?: string | null;
  added_by_name?: string | null;
};

export type KitchenPrintOrder = {
  id: string;
  created_at?: string | null;
  total_cents: number;
  approval_label?: string;
  items: KitchenPrintItem[];
};

export type KitchenPrintGuestTotal = {
  name: string;
  total_cents: number;
};

export type KitchenPrintPayload = {
  storeName: string;
  tableName: string;
  filterLabel: string;
  openedAt?: string | null;
  closedAt?: string | null;
  totalCents: number;
  orders: KitchenPrintOrder[];
  guestTotals?: KitchenPrintGuestTotal[];
};

export type KitchenPrintResult =
  | { status: 'printed' }
  | { status: 'cancelled'; message: string }
  | { status: 'error'; message: string };

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

const toTime = (value?: string | null) => {
  if (!value) return '--:--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--:--';
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const renderKitchenTicketHtml = (payload: KitchenPrintPayload) => {
  const ordersHtml = payload.orders
    .map((order) => {
      const itemsHtml = (order.items || [])
        .map((item) => {
          const itemName = `${item.qty}x ${item.name_snapshot || 'Item'}`;
          const itemTotal = formatCurrency((item.qty || 0) * (item.unit_price_cents || 0));
          return `
      <div class="item-line">
        <span class="label-col">${escapeHtml(itemName)}</span>
        <span class="value-col">${itemTotal}</span>
      </div>
      <div class="small muted">${escapeHtml(`Por: ${item.added_by_name || 'Operador'}`)}</div>
      ${item.note ? `<div class="small note-title">Observacao:</div>${formatTicketNoteHtml(item.note)}` : ''}`;
        })
        .join('');

      const approvalLine = `${order.approval_label || 'Confirmado'} • ${toTime(order.created_at || null)}`;
      return `
      <div class="row">
        <strong class="label-col">Pedido #${escapeHtml((order.id || '').slice(0, 6))}</strong>
        <span class="value-col">${formatCurrency(order.total_cents || 0)}</span>
      </div>
      <div class="small muted">${escapeHtml(approvalLine)}</div>
      ${itemsHtml}
      <div class="sep"></div>`;
    })
    .join('');

  const byGuestHtml = (payload.guestTotals || [])
    .map(
      (row) => `
      <div class="row">
        <span class="label-col">${escapeHtml(row.name)}</span>
        <span class="value-col">${formatCurrency(row.total_cents || 0)}</span>
      </div>`
    )
    .join('');

  const openedAt = payload.openedAt ? new Date(payload.openedAt).toLocaleString('pt-BR') : '-';
  const closedAt = payload.closedAt ? new Date(payload.closedAt).toLocaleString('pt-BR') : '-';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Comanda ${escapeHtml(payload.tableName)}</title>
<style>
  @page { size: auto; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; color: #000; background: #fff; }
  body { font-family: "Arial", "Helvetica", sans-serif; line-height: 1.46; font-size: 13px; }
  .ticket { width: 100%; min-height: auto; margin: 0 auto; padding: 4.4mm 3.8mm 5.6mm; }
  .store { margin: 0 0 1.8mm; text-align: center; font-size: 14px; font-weight: 800; letter-spacing: 0.02em; word-break: break-word; }
  h1 { margin: 0 0 1.8mm; font-size: 18px; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; word-break: break-word; }
  .meta { font-size: 12px; margin-bottom: 1.2mm; }
  .meta-line { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .meta-line span:first-child { color: #333; }
  .meta-line span:last-child { text-align: right; white-space: nowrap; font-weight: 700; }
  .sep { border-top: 1px dashed #777; margin: 2.2mm 0; }
  .section-title { margin: 0 0 1mm; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
  .row, .item-line { display: flex; justify-content: space-between; align-items: flex-start; gap: 7px; font-size: 13px; margin-bottom: 0.6mm; }
  .label-col { flex: 1; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
  .value-col { white-space: nowrap; margin-left: 4px; font-weight: 700; }
  .small { font-size: 12px; margin: 0.3mm 0 0.7mm; word-break: break-word; overflow-wrap: anywhere; }
  .small.muted { color: #444; }
  .small.note-title { color: #111; margin-bottom: 0.1mm; font-weight: 400; }
  .small.note-value { color: #111; margin-top: 0; padding-left: 0; }
  .note-key { font-weight: 800; }
  .total { font-size: 18px; font-weight: 800; margin-top: 0.8mm; }
  .footer { margin-top: 3.4mm; text-align: center; font-size: 13px; font-weight: 800; letter-spacing: 0.08em; }
  .footer-sep { border-top: 1px solid #000; margin: 3.1mm 0 1.8mm; }
</style>
</head>
<body>
  <div class="ticket">
    <p class="store">${escapeHtml(payload.storeName || 'Loja')}</p>
    <h1>Comanda ${escapeHtml(payload.tableName || 'Mesa')}</h1>
    <div class="meta meta-line"><span>Filtro</span><span>${escapeHtml(payload.filterLabel || 'Todos')}</span></div>
    <div class="meta meta-line"><span>Abertura</span><span>${escapeHtml(openedAt)}</span></div>
    <div class="meta meta-line"><span>Fechamento</span><span>${escapeHtml(closedAt)}</span></div>
    <div class="sep"></div>
    ${ordersHtml}
    <div class="total row"><span class="label-col">Total Geral</span><span class="value-col">${formatCurrency(payload.totalCents || 0)}</span></div>
    ${(payload.guestTotals || []).length > 0 ? `<div class="sep"></div><div class="section-title">Por pessoa</div>${byGuestHtml}` : ''}
    <div class="footer-sep"></div>
    <div class="footer">UaiTech</div>
  </div>
</body>
</html>`;
};

export const printKitchenTicket = async (payload: KitchenPrintPayload): Promise<KitchenPrintResult> => {
  const html = renderKitchenTicketHtml(payload);
  const win = window.open('', '_blank', 'width=540,height=920');
  if (!win) {
    return { status: 'error', message: 'Nao foi possivel abrir a janela de impressao.' };
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  const safelyClosePrintWindow = () => {
    try {
      if (!win.closed) win.close();
    } catch {
      // noop
    }
  };

  const handleAfterPrint = () => {
    window.setTimeout(() => {
      safelyClosePrintWindow();
    }, 120);
  };

  win.onafterprint = handleAfterPrint;
  if (typeof win.addEventListener === 'function') {
    win.addEventListener('afterprint', handleAfterPrint, { once: true });
  }

  await new Promise((resolve) => window.setTimeout(resolve, 180));

  try {
    win.focus();
    win.print();
  } catch (error: any) {
    safelyClosePrintWindow();
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('no longer runnable')) {
      return { status: 'cancelled', message: 'Impressao cancelada.' };
    }
    return { status: 'error', message };
  }

  window.setTimeout(() => {
    safelyClosePrintWindow();
  }, 15000);

  return { status: 'printed' };
};
