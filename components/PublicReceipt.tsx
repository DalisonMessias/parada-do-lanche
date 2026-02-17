import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildReceiptUrlFromToken,
  KitchenPrintTicket,
  UAITECH_LOGO_URL,
  kitchenTicketStyles,
  printKitchenTicket,
  renderKitchenTicketMarkup,
} from '../services/kitchenPrint';
import { downloadReceiptPdf } from '../services/receiptPdf';
import { supabase } from '../services/supabase';
import { DeliveryAddress } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

interface PublicReceiptProps {
  token: string;
  onBackHome?: () => void;
}

type PublicReceiptResponse = {
  store_name?: string;
  store_logo_url?: string | null;
  order?: {
    id?: string;
    service_type?: string;
    opened_at?: string | null;
    closed_at?: string | null;
    status?: string | null;
    approval_status?: string | null;
    table_name?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    delivery_address?: Record<string, any> | null;
    delivery_fee_cents?: number | null;
    subtotal_cents?: number | null;
    total_cents?: number | null;
    receipt_token?: string | null;
  };
  items?: Array<{
    id?: string;
    name_snapshot?: string | null;
    qty?: number | null;
    unit_price_cents?: number | null;
    note?: string | null;
  }>;
};

const mapTicketType = (serviceType?: string | null): KitchenPrintTicket['ticketType'] => {
  if (serviceType === 'ENTREGA') return 'ENTREGA';
  if (serviceType === 'RETIRADA') return 'RETIRADA';
  if (serviceType === 'CONSUMO_LOCAL') return 'BALCAO';
  return 'BALCAO';
};

const mapStatusLabel = (status?: string | null, approvalStatus?: string | null) => {
  if (approvalStatus === 'PENDING_APPROVAL') return 'Aguardando aceite';
  if (approvalStatus === 'REJECTED') return 'Rejeitado';
  if (status === 'PREPARING') return 'Em preparo';
  if (status === 'READY') return 'Pronto';
  if (status === 'FINISHED') return 'Finalizado';
  if (status === 'CANCELLED') return 'Cancelado';
  return 'Confirmado';
};

const normalizeDeliveryAddress = (value: Record<string, any> | null | undefined): DeliveryAddress | null => {
  if (!value || typeof value !== 'object') return null;
  const street = String(value.street || '').trim();
  const number = String(value.number || '').trim();
  const neighborhood = String(value.neighborhood || '').trim();
  const complement = String(value.complement || '').trim();
  const reference = String(value.reference || '').trim();

  if (!street && !number && !neighborhood && !complement && !reference) return null;

  return {
    street,
    number,
    neighborhood,
    ...(complement ? { complement } : {}),
    ...(reference ? { reference } : {}),
  };
};

const toTicket = (
  payload: PublicReceiptResponse | null,
  token: string,
  settings?: { store_name?: string; logo_url?: string } | null
): KitchenPrintTicket | null => {
  const order = payload?.order;
  if (!order?.id) return null;

  const ticketType = mapTicketType(order.service_type || null);
  const resolvedToken = (order.receipt_token || token || '').trim();

  return {
    storeName: (payload?.store_name || settings?.store_name || 'Loja').trim(),
    storeImageUrl: (payload?.store_logo_url || settings?.logo_url || '').trim() || null,
    orderId: order.id,
    ticketType,
    openedAt: order.opened_at || null,
    closedAt: order.closed_at || null,
    statusLabel: mapStatusLabel(order.status || null, order.approval_status || null),
    orderTime: order.opened_at
      ? new Date(order.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null,
    tableName: order.table_name || null,
    customerName: order.customer_name || null,
    customerPhone: order.customer_phone || null,
    deliveryAddress: normalizeDeliveryAddress(order.delivery_address || null),
    items: (payload?.items || []).map((item) => ({
      id: item.id || undefined,
      name_snapshot: (item.name_snapshot || 'Item').trim() || 'Item',
      qty: Math.max(1, Number(item.qty || 1)),
      unit_price_cents: Math.max(0, Number(item.unit_price_cents || 0)),
      note: item.note || null,
    })),
    subtotalCents: Math.max(0, Number(order.subtotal_cents || 0)),
    deliveryFeeCents: Math.max(0, Number(order.delivery_fee_cents || 0)),
    totalCents: Math.max(0, Number(order.total_cents || 0)),
    receiptToken: resolvedToken || null,
    receiptUrl: resolvedToken ? buildReceiptUrlFromToken(resolvedToken) : null,
  };
};

const PublicReceipt: React.FC<PublicReceiptProps> = ({ token, onBackHome }) => {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [ticket, setTicket] = useState<KitchenPrintTicket | null>(null);
  const [notFound, setNotFound] = useState(false);
  const ticketRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cleanToken = (token || '').trim();
    if (!cleanToken) {
      setNotFound(true);
      setLoading(false);
      setTicket(null);
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);
      setNotFound(false);

      const [receiptRes, settingsRes] = await Promise.all([
        supabase.rpc('get_public_receipt_by_token', {
          p_token: cleanToken,
        }),
        supabase.from('settings').select('logo_url, store_name').eq('id', 1).maybeSingle(),
      ]);

      if (!active) return;

      if (receiptRes.error) {
        setTicket(null);
        setNotFound(true);
        setLoading(false);
        return;
      }

      const settingsLogoUrl =
        !settingsRes.error && settingsRes.data
          ? String((settingsRes.data as any).logo_url || '').trim()
          : '';

      const normalized = toTicket(
        (receiptRes.data as PublicReceiptResponse) || null,
        cleanToken,
        settingsRes.data as any
      );
      if (!normalized) {
        setTicket(null);
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTicket(normalized);
      setNotFound(false);
      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [token]);

  const receiptMarkup = useMemo(() => {
    if (!ticket) return '';
    return renderKitchenTicketMarkup(ticket);
  }, [ticket]);

  const shortId = useMemo(() => {
    if (!ticket?.orderId) return 'cupom';
    return ticket.orderId.replace(/-/g, '').slice(0, 6) || 'cupom';
  }, [ticket?.orderId]);

  const handleDownloadPdf = async () => {
    if (!ticketRef.current || !ticket || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadReceiptPdf({
        element: ticketRef.current,
        fileName: `cupom_${shortId}.pdf`,
      });
    } catch (error: any) {
      toast(error?.message || 'Falha ao gerar PDF, tente novamente.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = async () => {
    if (!ticket || printing) return;
    setPrinting(true);
    const result = await printKitchenTicket({ tickets: [ticket] });
    setPrinting(false);

    if (result.status === 'error') {
      toast(result.message || 'Falha ao imprimir cupom.', 'error');
      return;
    }
    if (result.status === 'cancelled') {
      toast('Impressao cancelada.', 'info');
    }
  };

  return (
    <div className="public-receipt-shell min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cupom Fiscal Digital</p>
            <img src={UAITECH_LOGO_URL} alt="Logo da loja" className="h-6 w-auto mt-1" />
          </div>
          {onBackHome && (
            <button
              type="button"
              onClick={onBackHome}
              className="px-3 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-600"
            >
              Inicio
            </button>
          )}
        </div>

        {loading && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
            <p className="text-sm font-black uppercase tracking-widest text-gray-500">Carregando cupom...</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
            <p className="text-base font-black uppercase tracking-widest text-red-700">Cupom nao encontrado</p>
            <p className="text-sm font-bold text-red-600">
              Verifique o QR Code e tente novamente.
            </p>
          </div>
        )}

        {!loading && !notFound && ticket && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {downloadingPdf ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={printing}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {printing ? 'Abrindo...' : 'Imprimir'}
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div ref={ticketRef} dangerouslySetInnerHTML={{ __html: receiptMarkup }} />
            </div>
          </>
        )}
      </div>

      <style>{`
        ${kitchenTicketStyles}
        .public-receipt-shell .ticket-sheet {
          max-width: 80mm;
          margin: 0 auto;
        }
      `}</style>
    </div>
  );
};

export default PublicReceipt;
