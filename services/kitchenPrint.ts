import { DeliveryAddress } from '../types';
import { groupOrderItems } from './orderItemGrouping';
import { formatCurrency } from './supabase';
import QRCode from 'qrcode';

export const UAITECH_LOGO_URL =
  'https://obeoiqjwqchwedeupngc.supabase.co/storage/v1/object/public/assets/logos/logo-uaitech.png';

export type KitchenPrintTicketType = 'MESA' | 'BALCAO' | 'RETIRADA' | 'ENTREGA';

export type KitchenPrintItem = {
  id?: string;
  name_snapshot: string;
  qty: number;
  unit_price_cents: number;
  note?: string | null;
};

export type KitchenPrintTicket = {
  storeName: string;
  storeImageUrl?: string | null;
  orderId: string;
  ticketType: KitchenPrintTicketType;
  openedAt?: string | null;
  closedAt?: string | null;
  statusLabel?: string | null;
  orderTime?: string | null;
  tableName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: DeliveryAddress | null;
  items: KitchenPrintItem[];
  subtotalCents: number;
  serviceFeeCents?: number;
  deliveryFeeCents?: number;
  totalCents: number;
  receiptToken?: string | null;
  receiptUrl?: string | null;
};

export type KitchenPrintPayload = {
  tickets: KitchenPrintTicket[];
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

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('pt-BR');
};

const formatTime = (value?: string | null) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const normalizeShortId = (value: string) => {
  const short = (value || '').replace(/-/g, '').slice(0, 6);
  return escapeHtml(short || value || '-');
};

const toStrongLabel = (label: string) => `<strong class="ticket-label">${escapeHtml(label)}:</strong>`;

const getTypeLabel = (type: KitchenPrintTicketType) => {
  if (type === 'ENTREGA') return 'ENTREGA';
  if (type === 'RETIRADA') return 'RETIRADA';
  if (type === 'BALCAO') return 'BALCAO';
  return 'MESA';
};

const getQrUrl = (data: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data)}&margin=0`;

const getQrFallbackUrl = (data: string) =>
  `https://quickchart.io/qr?size=240&text=${encodeURIComponent(data)}`;

const generateQrDataUrl = async (data: string) => {
  if (!data.trim()) return '';
  try {
    return await QRCode.toDataURL(data, {
      width: 240,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
  } catch {
    return '';
  }
};

export const buildReceiptUrlFromToken = (token: string, origin?: string) => {
  const cleanToken = (token || '').trim();
  if (!cleanToken) return '';
  if (origin && origin.trim()) return `${origin.replace(/\/$/, '')}/#/cupom/${cleanToken}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/#/cupom/${cleanToken}`;
  }
  return `/#/cupom/${cleanToken}`;
};

const resolveReceiptUrl = (ticket: KitchenPrintTicket) => {
  const explicitUrl = (ticket.receiptUrl || '').trim();
  if (explicitUrl) return explicitUrl;
  const token = (ticket.receiptToken || '').trim();
  if (!token) return '';
  return buildReceiptUrlFromToken(token);
};

const formatTicketNoteHtml = (note: string) => {
  const lines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  return lines
    .map((line) => `<div class="ticket-item-note-line">${escapeHtml(line)}</div>`)
    .join('');
};

const renderFieldRow = (label: string, value: string) => `
  <div class="ticket-meta-row">
    <span>${toStrongLabel(label)}</span>
    <span class="ticket-value">${escapeHtml(value)}</span>
  </div>
`;

const renderDeliverySection = (ticket: KitchenPrintTicket) => {
  if (ticket.ticketType !== 'ENTREGA') return '';
  const address = ticket.deliveryAddress || null;
  if (!address && !ticket.customerPhone) return '';

  const fields: Array<{ label: string; value?: string | null }> = [
    { label: 'Rua', value: address?.street || null },
    { label: 'Numero', value: address?.number || null },
    { label: 'Bairro', value: address?.neighborhood || null },
    { label: 'Referencia', value: address?.reference || null },
    { label: 'Telefone', value: ticket.customerPhone || null },
  ];

  const rows = fields
    .filter((field) => (field.value || '').trim().length > 0)
    .map((field) => renderFieldRow(field.label, String(field.value)));

  if (rows.length === 0) return '';

  return `
    <div class="ticket-separator"></div>
    <p class="ticket-section-title">ENTREGA</p>
    <div class="ticket-section-block">
      ${rows.join('')}
    </div>
  `;
};

const renderCustomerBlock = (ticket: KitchenPrintTicket) => {
  const shouldShow =
    ticket.ticketType === 'ENTREGA' ||
    ticket.ticketType === 'RETIRADA';

  if (!shouldShow) return '';

  const rows: string[] = [];
  if ((ticket.customerName || '').trim()) {
    rows.push(renderFieldRow('Nome', ticket.customerName || ''));
  }
  if ((ticket.customerPhone || '').trim() && ticket.ticketType === 'RETIRADA') {
    rows.push(renderFieldRow('Telefone', ticket.customerPhone || ''));
  }

  if (rows.length === 0) return '';

  return `
    <div class="ticket-separator"></div>
    <div class="ticket-section-block">
      ${rows.join('')}
    </div>
  `;
};

const renderItems = (ticket: KitchenPrintTicket) => {
  const groupedItems = groupOrderItems(ticket.items || []);
  return groupedItems
    .map((item) => {
      const itemName = `${item.qty}x ${item.name_snapshot || 'Item'}`;
      const itemTotal = formatCurrency((item.qty || 0) * (item.unit_price_cents || 0));
      return `
        <div class="ticket-item-row">
          <span class="ticket-item-name">${escapeHtml(itemName)}</span>
          <span class="ticket-item-value">${itemTotal}</span>
        </div>
        ${item.note ? `<div class="ticket-item-note">${formatTicketNoteHtml(item.note)}</div>` : ''}
      `;
    })
    .join('');
};

const renderQrBlock = (ticket: KitchenPrintTicket, qrDataUrl?: string) => {
  const eligibleType = ticket.ticketType === 'ENTREGA' || ticket.ticketType === 'RETIRADA';
  if (!eligibleType) return '';

  const receiptUrl = resolveReceiptUrl(ticket);
  if (!receiptUrl) return '';

  const safeQrDataUrl = (qrDataUrl || '').trim();
  const qrUrl = safeQrDataUrl || getQrUrl(receiptUrl);
  const fallbackQrUrl = getQrFallbackUrl(receiptUrl);
  const onErrorAttr = safeQrDataUrl
    ? ''
    : ` onerror="this.onerror=null;this.src='${fallbackQrUrl}';"`;

  return `
    <div class="ticket-separator"></div>
    <div class="ticket-qr-block">
      <p class="ticket-qr-title">Cupom Fiscal Digital</p>
      <img
        class="ticket-qr-image"
        src="${qrUrl}"
        alt="QR Code Cupom Fiscal Digital"
        ${onErrorAttr}
      />
      <p class="ticket-qr-text">Aponte a camera para acessar e baixar seu cupom.</p>
    </div>
  `;
};

const renderTicketCore = (ticket: KitchenPrintTicket, qrDataUrl?: string) => {
  const typeLabel = getTypeLabel(ticket.ticketType);
  const orderIdLabel = normalizeShortId(ticket.orderId);
  const openedAt = formatDateTime(ticket.openedAt);
  const closedAt = formatDateTime(ticket.closedAt);
  const orderTime = ticket.orderTime || formatTime(ticket.openedAt);
  const statusLabel = (ticket.statusLabel || '').trim() || 'Confirmado';
  const showServiceFee = ticket.ticketType === 'MESA' && (ticket.serviceFeeCents || 0) > 0;
  const showDeliveryFee = ticket.ticketType === 'ENTREGA' && (ticket.deliveryFeeCents || 0) > 0;
  const storeImageUrl = escapeHtml((ticket.storeImageUrl || '').trim());
  const uaiTechLogoUrl = escapeHtml(UAITECH_LOGO_URL);

  return `
    <section class="ticket-sheet">
      <header class="ticket-header">
        ${storeImageUrl ? `<img src="${storeImageUrl}" alt="Logo da loja" class="ticket-store-logo" />` : ''}
        <p class="ticket-store-name">${escapeHtml(ticket.storeName || 'Parada do Lanche')}</p>
        <img src="${uaiTechLogoUrl}" alt="Logo UaiTech" class="ticket-uaitech-logo ticket-uaitech-logo--header" />
      </header>

      <section class="ticket-meta">
        ${renderFieldRow('Tipo', typeLabel)}
        <div class="ticket-meta-row">
          <span>${toStrongLabel('Pedido')}</span>
          <span class="ticket-value">#${orderIdLabel}</span>
        </div>
        <div class="ticket-meta-row">
          <span>${toStrongLabel('Abertura')}</span>
          <span class="ticket-value">${escapeHtml(openedAt)}</span>
        </div>
        <div class="ticket-meta-row">
          <span>${toStrongLabel('Fechamento')}</span>
          <span class="ticket-value">${escapeHtml(closedAt)}</span>
        </div>
        ${
          ticket.ticketType === 'MESA'
            ? renderFieldRow('Mesa', ticket.tableName || 'Mesa')
            : ''
        }
      </section>

      <div class="ticket-separator"></div>

      <section class="ticket-order-meta">
        <p class="ticket-order-title">Pedido #${orderIdLabel}</p>
        ${renderFieldRow('Status', statusLabel)}
        ${renderFieldRow('Horario', orderTime)}
      </section>

      ${renderCustomerBlock(ticket)}
      ${renderDeliverySection(ticket)}

      <div class="ticket-separator"></div>

      <section class="ticket-items">
        ${renderItems(ticket)}
      </section>

      <div class="ticket-separator"></div>

      <section class="ticket-summary">
        <div class="ticket-total-row">
          <span>${toStrongLabel('Subtotal')}</span>
          <span class="ticket-value-strong">${formatCurrency(ticket.subtotalCents || 0)}</span>
        </div>
        ${
          showServiceFee
            ? `
              <div class="ticket-total-row">
                <span>${toStrongLabel('Taxa de Servico')}</span>
                <span class="ticket-value-strong">${formatCurrency(ticket.serviceFeeCents || 0)}</span>
              </div>
            `
            : ''
        }
        ${
          showDeliveryFee
            ? `
              <div class="ticket-total-row">
                <span>${toStrongLabel('Taxa de Entrega')}</span>
                <span class="ticket-value-strong">${formatCurrency(ticket.deliveryFeeCents || 0)}</span>
              </div>
            `
            : ''
        }
        <div class="ticket-solid-separator"></div>
        <div class="ticket-total-row ticket-grand-total">
          <span>${toStrongLabel('Total Geral')}</span>
          <span class="ticket-value-strong">${formatCurrency(ticket.totalCents || 0)}</span>
        </div>
      </section>

      ${renderQrBlock(ticket, qrDataUrl)}

      <footer class="ticket-footer">
        <img src="${uaiTechLogoUrl}" alt="Logo UaiTech" class="ticket-uaitech-logo ticket-uaitech-logo--footer" />
      </footer>
    </section>
  `;
};

export const kitchenTicketStyles = `
  @page { size: auto; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; color: #000; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; line-height: 1.34; font-size: 12px; }
  .ticket-page-break {
    page-break-before: always;
    break-before: page;
  }
  .ticket-sheet {
    width: 100%;
    margin: 0 auto;
    padding: 4.2mm 3.4mm 5.2mm;
  }
  .ticket-header {
    text-align: center;
    margin: 0 0 1.8mm;
  }
  .ticket-store-name {
    margin: 0;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.02em;
    word-break: break-word;
  }
  .ticket-store-logo {
    width: 20mm;
    max-width: 100%;
    height: 20mm;
    object-fit: contain;
    margin: 0 auto 1.2mm;
    display: block;
  }
  .ticket-uaitech-logo {
    display: block;
    margin: 0 auto;
    object-fit: contain;
  }
  .ticket-uaitech-logo--header {
    width: 22mm;
    height: 7mm;
    margin-top: 0.8mm;
  }
  .ticket-uaitech-logo--footer {
    width: 20mm;
    height: 6.5mm;
  }
  .ticket-meta,
  .ticket-order-meta,
  .ticket-section-block {
    display: flex;
    flex-direction: column;
    gap: 0.8mm;
  }
  .ticket-meta-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    font-size: 12px;
  }
  .ticket-label {
    font-weight: 900;
  }
  .ticket-value {
    text-align: right;
    font-weight: 700;
    white-space: nowrap;
  }
  .ticket-value-strong {
    text-align: right;
    font-weight: 900;
    white-space: nowrap;
  }
  .ticket-order-title {
    margin: 0 0 0.5mm;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.01em;
  }
  .ticket-section-title {
    margin: 0 0 1mm;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .ticket-separator {
    border-top: 1px dashed #666;
    margin: 2mm 0;
  }
  .ticket-solid-separator {
    border-top: 1px solid #000;
    margin: 1mm 0 1.4mm;
  }
  .ticket-items {
    display: flex;
    flex-direction: column;
    gap: 1.1mm;
  }
  .ticket-item-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
    font-size: 12px;
  }
  .ticket-item-name {
    flex: 1;
    min-width: 0;
    font-weight: 700;
    word-break: break-word;
  }
  .ticket-item-value {
    font-weight: 900;
    white-space: nowrap;
  }
  .ticket-item-note {
    margin-top: -0.4mm;
    margin-bottom: 0.8mm;
    color: #1f2937;
  }
  .ticket-item-note-line {
    font-size: 11px;
    font-weight: 700;
    word-break: break-word;
  }
  .ticket-summary {
    display: flex;
    flex-direction: column;
    gap: 0.8mm;
  }
  .ticket-total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
  }
  .ticket-grand-total {
    font-size: 16px;
    font-weight: 900;
  }
  .ticket-qr-block {
    margin-top: 0.5mm;
    text-align: center;
  }
  .ticket-qr-title {
    margin: 0;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.03em;
  }
  .ticket-qr-image {
    width: 30mm;
    height: 30mm;
    margin: 1.4mm auto 1mm;
    display: block;
    image-rendering: pixelated;
  }
  .ticket-qr-text {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.3;
  }
  .ticket-footer {
    margin: 2.2mm 0 0;
    text-align: center;
  }
`;

export const renderKitchenTicketMarkup = (ticket: KitchenPrintTicket, qrDataUrl?: string) =>
  renderTicketCore(ticket, qrDataUrl);

export const renderKitchenTicketDocument = (payload: KitchenPrintPayload, qrDataUrlByIndex?: Map<number, string>) => {
  const tickets = payload.tickets || [];
  const ticketsHtml = tickets
    .map((ticket, index) => {
      const qrDataUrl = qrDataUrlByIndex?.get(index);
      return `${index > 0 ? '<div class="ticket-page-break"></div>' : ''}${renderKitchenTicketMarkup(ticket, qrDataUrl)}`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cupom Fiscal</title>
  <style>${kitchenTicketStyles}</style>
</head>
<body>
  ${ticketsHtml}
</body>
</html>`;
};

const buildQrDataUrlByIndex = async (tickets: KitchenPrintTicket[]) => {
  const entries = await Promise.all(
    tickets.map(async (ticket, index) => {
      const eligibleType = ticket.ticketType === 'ENTREGA' || ticket.ticketType === 'RETIRADA';
      if (!eligibleType) return null;
      const receiptUrl = resolveReceiptUrl(ticket);
      if (!receiptUrl) return null;

      const qrDataUrl = await generateQrDataUrl(receiptUrl);
      if (!qrDataUrl) return null;
      return [index, qrDataUrl] as const;
    })
  );

  const qrMap = new Map<number, string>();
  entries.forEach((entry) => {
    if (entry) qrMap.set(entry[0], entry[1]);
  });

  return qrMap;
};

const waitForPrintWindowAssets = async (win: Window, timeoutMs = 3500) => {
  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    const images = Array.from(win.document.images || []);
    if (images.length === 0) {
      window.clearTimeout(timer);
      finish();
      return;
    }

    let pending = 0;
    const settleOne = () => {
      pending -= 1;
      if (pending <= 0) {
        window.clearTimeout(timer);
        finish();
      }
    };

    images.forEach((img) => {
      if (img.complete && img.naturalWidth > 0) return;
      pending += 1;
      img.addEventListener('load', settleOne, { once: true });
      img.addEventListener('error', settleOne, { once: true });
    });

    if (pending === 0) {
      window.clearTimeout(timer);
      finish();
    }
  });
};

export const printKitchenTicket = async (payload: KitchenPrintPayload): Promise<KitchenPrintResult> => {
  const tickets = payload.tickets || [];
  if (tickets.length === 0) {
    return { status: 'error', message: 'Nao ha cupons para imprimir.' };
  }

  const win = window.open('', '_blank', 'width=560,height=920');
  if (!win) {
    return { status: 'error', message: 'Nao foi possivel abrir a janela de impressao.' };
  }

  const qrDataUrlByIndex = await buildQrDataUrlByIndex(tickets);
  const html = renderKitchenTicketDocument(payload, qrDataUrlByIndex);

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

  await waitForPrintWindowAssets(win);

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
