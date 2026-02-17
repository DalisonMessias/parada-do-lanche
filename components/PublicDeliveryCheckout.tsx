import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, supabase } from '../services/supabase';
import { groupOrderItems } from '../services/orderItemGrouping';
import {
  DeliveryCheckoutPayload,
  DeliveryPaymentMethod,
  clearDeliveryCart,
  clearDeliveryPrompt,
  getDeliveryCartCount,
  getDeliveryCartPromotionDiscount,
  getDeliveryCartTotal,
  readDeliveryCart,
  readDeliveryCheckoutDraft,
  readDeliveryPrompt,
  saveDeliveryCheckoutDraft,
} from '../services/deliverySession';
import { StoreSettings } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import AppModal from './ui/AppModal';

interface PublicDeliveryCheckoutProps {
  settings: StoreSettings | null;
}

const parseMaskedCurrencyToCents = (value: string) => {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return 0;
  const cents = Number(digits);
  return Number.isFinite(cents) ? Math.max(0, cents) : 0;
};

const formatCentsToMaskedCurrency = (cents: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number(cents || 0)) / 100);

const maskCurrencyInput = (value: string) => formatCentsToMaskedCurrency(parseMaskedCurrencyToCents(value));

const makeItemNote = (addonNames: string[], observation: string) => {
  const lines: string[] = [];
  if (addonNames.length > 0) lines.push(`Adicionais: ${addonNames.join(', ')}`);
  const cleanObs = observation.trim();
  if (cleanObs) lines.push(`Observacao: ${cleanObs}`);
  return lines.length > 0 ? lines.join('\n') : null;
};

const PublicDeliveryCheckout: React.FC<PublicDeliveryCheckoutProps> = ({ settings }) => {
  const { toast } = useFeedback();
  const [cart, setCart] = useState(() => readDeliveryCart());
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const checkoutDraft = useMemo(() => readDeliveryCheckoutDraft(), []);

  const [customerName, setCustomerName] = useState(checkoutDraft.customer_name);
  const [customerPhone, setCustomerPhone] = useState(checkoutDraft.customer_phone);
  const [street, setStreet] = useState(checkoutDraft.street);
  const [number, setNumber] = useState(checkoutDraft.number);
  const [neighborhood, setNeighborhood] = useState(checkoutDraft.neighborhood);
  const [complement, setComplement] = useState(checkoutDraft.complement);
  const [reference, setReference] = useState(checkoutDraft.reference);
  const [observation, setObservation] = useState(checkoutDraft.observation);
  const [paymentMethod, setPaymentMethod] = useState<DeliveryPaymentMethod>(checkoutDraft.payment_method);
  const [needsChange, setNeedsChange] = useState(checkoutDraft.needs_change);
  const [changeForInput, setChangeForInput] = useState(
    formatCentsToMaskedCurrency(checkoutDraft.cash_change_for_cents)
  );

  useEffect(() => {
    const stored = readDeliveryCart();
    setCart(stored);
    if (stored.length === 0) {
      window.history.pushState({}, '', '/menudigital/menu');
    }
  }, []);

  const pixKey = useMemo(() => String(settings?.pix_key_value || '').trim(), [settings?.pix_key_value]);
  const pixKeyType = useMemo(() => String(settings?.pix_key_type || '').trim(), [settings?.pix_key_type]);
  const hasPixKey = pixKey.length > 0;

  useEffect(() => {
    if (paymentMethod === 'PIX' && !hasPixKey) {
      setPaymentMethod('CARD');
    }
  }, [paymentMethod, hasPixKey]);

  useEffect(() => {
    saveDeliveryCheckoutDraft({
      customer_name: customerName,
      customer_phone: customerPhone,
      street,
      number,
      neighborhood,
      complement,
      reference,
      observation,
      payment_method: paymentMethod,
      needs_change: needsChange,
      cash_change_for_cents: parseMaskedCurrencyToCents(changeForInput),
    });
  }, [
    customerName,
    customerPhone,
    street,
    number,
    neighborhood,
    complement,
    reference,
    observation,
    paymentMethod,
    needsChange,
    changeForInput,
  ]);

  const cartCount = getDeliveryCartCount(cart);
  const subtotal = getDeliveryCartTotal(cart);
  const promotionDiscount = getDeliveryCartPromotionDiscount(cart);
  const defaultDeliveryFee = Math.max(0, Number(settings?.default_delivery_fee_cents || 0));
  const estimatedTotal = subtotal + defaultDeliveryFee;
  const deliveryIntent = readDeliveryPrompt();

  const validatePayload = (): DeliveryCheckoutPayload | null => {
    if (cart.length === 0) {
      toast('Seu carrinho esta vazio.', 'info');
      window.history.pushState({}, '', '/menudigital/menu');
      return null;
    }

    if (!customerName.trim()) {
      toast('Informe o nome para entrega.', 'error');
      return null;
    }
    if (!customerPhone.trim()) {
      toast('Informe o telefone para contato.', 'error');
      return null;
    }
    if (!street.trim() || !number.trim() || !neighborhood.trim()) {
      toast('Preencha rua, numero e bairro para entrega.', 'error');
      return null;
    }
    if (paymentMethod === 'PIX' && !hasPixKey) {
      toast('Pix indisponivel: cadastre uma chave Pix nas configuracoes.', 'error');
      return null;
    }

    const cashChangeForCents =
      paymentMethod === 'CASH' && needsChange ? parseMaskedCurrencyToCents(changeForInput) : 0;
    if (paymentMethod === 'CASH' && needsChange && cashChangeForCents <= 0) {
      toast('Informe o valor do troco.', 'error');
      return null;
    }

    return {
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      delivery_address: {
        street: street.trim(),
        number: number.trim(),
        neighborhood: neighborhood.trim(),
        ...(complement.trim() ? { complement: complement.trim() } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      },
      general_note: observation.trim() || undefined,
      payment_method: paymentMethod,
      cash_change_for_cents: cashChangeForCents,
    };
  };

  const submitOrder = async () => {
    const payload = validatePayload();
    if (!payload) return;

    setLoading(true);
    const items = groupOrderItems(
      cart.map((item) => ({
        product_id: item.product_id,
        name_snapshot: item.product_name,
        original_unit_price_cents: Math.max(
          0,
          Number(item.base_price_cents || 0) + Number(item.addon_total_cents || 0)
        ),
        unit_price_cents: item.unit_price_cents,
        promo_name: item.promo_name,
        promo_discount_type: item.promo_discount_type,
        promo_discount_value: item.promo_discount_value,
        promo_discount_cents: item.promo_discount_cents,
        qty: item.qty,
        note: makeItemNote(item.addon_names, item.observation),
        added_by_name: 'Cliente',
        status: 'PENDING',
      }))
    );

    const noteParts = [payload.general_note || '', deliveryIntent ? `Pedido inicial: ${deliveryIntent}` : '']
      .map((value) => value.trim())
      .filter(Boolean);
    const generalNote = noteParts.length > 0 ? noteParts.join('\n') : null;

    const { data, error } = await supabase.rpc('create_public_delivery_order', {
      p_customer_name: payload.customer_name,
      p_customer_phone: payload.customer_phone,
      p_general_note: generalNote,
      p_delivery_address: payload.delivery_address,
      p_delivery_payment_method: payload.payment_method,
      p_delivery_cash_change_for_cents: payload.cash_change_for_cents,
      p_items: items,
    });

    if (error || !data) {
      setLoading(false);
      toast(error?.message || 'Nao foi possivel confirmar o pedido de entrega.', 'error');
      return;
    }

    let receiptToken = String((data as any)?.receipt_token || '').trim();
    const orderId = String((data as any)?.order_id || '').trim();

    if (!receiptToken && orderId) {
      const { data: tokenData } = await supabase.rpc('ensure_order_receipt_token', {
        p_order_id: orderId,
      });
      receiptToken = String(tokenData || '').trim();
    }

    setLoading(false);
    clearDeliveryCart();
    clearDeliveryPrompt();
    setCart([]);

    if (!receiptToken) {
      toast('Pedido confirmado. Nao foi possivel abrir o cupom agora.', 'success');
      window.history.pushState({}, '', '/');
      return;
    }

    toast('Pedido de entrega confirmado!', 'success');
    window.history.pushState({}, '', `/cupom/${receiptToken}`);
  };

  if (cartCount === 0) {
    return null;
  }

  return (
    <div className="p-5 lg:p-8 pb-28 space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Checkout da Entrega</p>
        <h2 className="text-xl lg:text-2xl font-black text-gray-900 uppercase tracking-tighter">
          Dados de Entrega e Pagamento
        </h2>
        <p className="text-sm text-gray-500 font-bold">
          Pagamento sempre no momento da entrega.
        </p>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-500">Dados de Entrega</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nome *"
            className="p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
          />
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Telefone *"
            className="p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
          />
          <input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Rua *"
            className="p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary md:col-span-2"
          />
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Numero *"
            className="p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
          />
          <input
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            placeholder="Bairro *"
            className="p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
          />
          <input
            value={complement}
            onChange={(e) => setComplement(e.target.value)}
            placeholder="Complemento (opcional)"
            className="p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
          />
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Referencia (opcional)"
            className="p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
          />
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-500">Pagamento na Entrega</h3>
        <div className="grid sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod('CARD')}
            className={`rounded-xl border p-3 text-[10px] font-black uppercase tracking-widest ${
              paymentMethod === 'CARD'
                ? 'border-primary bg-primary/10 text-gray-900'
                : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            Cartao
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('CASH')}
            className={`rounded-xl border p-3 text-[10px] font-black uppercase tracking-widest ${
              paymentMethod === 'CASH'
                ? 'border-primary bg-primary/10 text-gray-900'
                : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            Dinheiro
          </button>
          <button
            type="button"
            onClick={() => hasPixKey && setPaymentMethod('PIX')}
            disabled={!hasPixKey}
            className={`rounded-xl border p-3 text-[10px] font-black uppercase tracking-widest ${
              paymentMethod === 'PIX'
                ? 'border-primary bg-primary/10 text-gray-900'
                : 'border-gray-200 bg-white text-gray-600'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Pix
          </button>
        </div>

        {paymentMethod === 'PIX' && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">
              Chave Pix ({pixKeyType || 'chave'})
            </p>
            <p className="text-sm font-black text-emerald-800 break-all">{pixKey || 'Nao cadastrada'}</p>
          </div>
        )}

        {paymentMethod === 'CASH' && (
          <div className="rounded-xl border border-gray-200 p-3 space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">
                Precisa de troco?
              </span>
              <input
                type="checkbox"
                checked={needsChange}
                onChange={(e) => setNeedsChange(e.target.checked)}
                aria-label="Precisa de troco"
              />
            </label>
            {needsChange && (
              <input
                value={changeForInput}
                onChange={(e) => setChangeForInput(maskCurrencyInput(e.target.value))}
                inputMode="numeric"
                placeholder="Valor para troco"
                className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
              />
            )}
          </div>
        )}

        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={3}
          placeholder="Observacoes do pedido (opcional)"
          className="w-full rounded-xl border border-gray-200 p-3 text-sm font-bold outline-none focus:border-primary"
        />
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-500">Resumo</h3>
        <div className="flex justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Itens ({cartCount})</span>
          <span className="font-black text-gray-900">{formatCurrency(subtotal)}</span>
        </div>
        {promotionDiscount > 0 && (
          <div className="flex justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Descontos</span>
            <span className="font-black text-emerald-600">- {formatCurrency(promotionDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Taxa de entrega (estimada)</span>
          <span className="font-black text-gray-900">+ {formatCurrency(defaultDeliveryFee)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total estimado</span>
          <span className="font-black text-xl text-primary">{formatCurrency(estimatedTotal)}</span>
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-40">
        <div className="max-w-md mx-auto flex gap-2">
          <button
            type="button"
            onClick={() => window.history.pushState({}, '', '/menudigital/menu')}
            className="flex-1 py-4 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-700"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="flex-1 py-4 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest"
          >
            Confirmar Pedido
          </button>
        </div>
      </div>

      {showConfirmModal && (
        <AppModal
          open={showConfirmModal}
          onClose={() => (loading ? null : setShowConfirmModal(false))}
          size="sm"
          zIndex={140}
          title="Confirmar Pedido"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-700"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={submitOrder}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? 'Confirmando...' : 'Finalizar'}
              </button>
            </div>
          }
        >
          <p className="text-sm font-bold text-gray-700">
            O pedido sera enviado para o atendimento e o pagamento sera realizado somente na entrega.
          </p>
        </AppModal>
      )}
    </div>
  );
};

export default PublicDeliveryCheckout;
