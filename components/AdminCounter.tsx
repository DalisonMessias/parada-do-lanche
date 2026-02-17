import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, supabase } from '../services/supabase';
import { buildReceiptUrlFromToken, printKitchenTicket } from '../services/kitchenPrint';
import { buildLineItemKey, groupOrderItems } from '../services/orderItemGrouping';
import { DeliveryAddress, DiscountMode, Order, OrderItem, Product, ProductAddon, Profile, Promotion, ServiceType, Session, StoreSettings } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import CustomSelect from './ui/CustomSelect';
import AppModal from './ui/AppModal';
import { applyPromotionToPrice, resolvePromotionForProduct } from '../services/promotions';

type SessionWithDetails = Session & {
  table?: { id: string; name: string; table_type?: string; token?: string } | null;
  orders?: (Order & { items?: OrderItem[] })[];
};

type CounterCartItem = {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  base_price_cents: number;
  addon_total_cents: number;
  unit_price_cents: number;
  promo_name: string | null;
  promo_discount_type: 'AMOUNT' | 'PERCENT' | null;
  promo_discount_value: number;
  promo_discount_cents: number;
  addon_names: string[];
  observation: string;
};

type CounterPayloadItem = {
  product_id: string;
  name_snapshot: string;
  original_unit_price_cents: number;
  unit_price_cents: number;
  promo_name: string | null;
  promo_discount_type: 'AMOUNT' | 'PERCENT' | null;
  promo_discount_value: number;
  promo_discount_cents: number;
  qty: number;
  note: string | null;
  added_by_name: string;
  status: 'PENDING';
};

type CounterServiceType = 'NONE' | 'RETIRADA' | 'ENTREGA' | 'CONSUMO_LOCAL';
type CounterPaymentMethod = 'CARD' | 'CASH' | 'PIX';

interface AdminCounterProps {
  profile: Profile | null;
  settings: StoreSettings | null;
}

const makeId = () => Math.random().toString(36).slice(2);

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parseMaskedCurrencyToCents = (value: string) => {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return 0;
  const cents = Number(digits);
  return Number.isFinite(cents) ? Math.max(0, cents) : 0;
};

const formatCentsToMaskedCurrency = (cents: number) =>
  `R$ ${currencyFormatter.format(Math.max(0, Number(cents || 0)) / 100)}`;

const maskCurrencyInput = (value: string) => formatCentsToMaskedCurrency(parseMaskedCurrencyToCents(value));

const parsePercent = (value: string) => {
  const numeric = Number((value || '').replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const makeItemNote = (addonNames: string[], observation: string) => {
  const lines: string[] = [];
  if (addonNames.length > 0) lines.push(`Adicionais: ${addonNames.join(', ')}`);
  const cleanObs = observation.trim();
  if (cleanObs) lines.push(`Observacao: ${cleanObs}`);
  return lines.length > 0 ? lines.join('\n') : null;
};

const getVisibleOrders = (session: SessionWithDetails) =>
  (session.orders || []).filter((order) => order.approval_status !== 'REJECTED');

const paymentMethodLabels: Record<CounterPaymentMethod, string> = {
  CARD: 'Cartao',
  CASH: 'Dinheiro',
  PIX: 'Pix',
};

const shouldHaveReceiptToken = (ticketType: 'MESA' | 'BALCAO' | 'RETIRADA' | 'ENTREGA') =>
  ticketType === 'ENTREGA' || ticketType === 'RETIRADA';

const getTicketStatusLabel = (order: Order) => {
  if (order.approval_status === 'PENDING_APPROVAL') return 'Aguardando aceite';
  if (order.approval_status === 'REJECTED') return 'Rejeitado';
  if (order.status === 'PREPARING') return 'Em preparo';
  if (order.status === 'READY') return 'Pronto';
  if (order.status === 'FINISHED') return 'Finalizado';
  if (order.status === 'CANCELLED') return 'Cancelado';
  return 'Confirmado';
};

const AdminCounter: React.FC<AdminCounterProps> = ({ profile, settings }) => {
  const { toast } = useFeedback();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [counterSession, setCounterSession] = useState<SessionWithDetails | null>(null);

  const [search, setSearch] = useState('');
  const [cartItems, setCartItems] = useState<CounterCartItem[]>([]);
  const [printNow, setPrintNow] = useState(true);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<'NEW' | 'ADDITIONAL'>('NEW');
  const [additionalLinkType, setAdditionalLinkType] = useState<'SESSION' | 'ORDER'>('SESSION');
  const [selectedAdditionalSessionId, setSelectedAdditionalSessionId] = useState('');
  const [selectedAdditionalOrderId, setSelectedAdditionalOrderId] = useState('');

  const [customerName, setCustomerName] = useState('Balcao');
  const [customerPhone, setCustomerPhone] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [serviceType, setServiceType] = useState<CounterServiceType>('CONSUMO_LOCAL');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('R$ 0,00');
  const [paymentMethod, setPaymentMethod] = useState<CounterPaymentMethod>('CARD');
  const [cashChangeInput, setCashChangeInput] = useState('R$ 0,00');

  const [discountMode, setDiscountMode] = useState<DiscountMode>('NONE');
  const [discountInput, setDiscountInput] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQty, setPendingQty] = useState(1);
  const [pendingObservation, setPendingObservation] = useState('');
  const [pendingAddonIds, setPendingAddonIds] = useState<string[]>([]);

  const counterEnabled = settings?.enable_counter_module !== false;
  const hasThermalPrinter = settings?.has_thermal_printer === true;

  useEffect(() => {
    if (!hasThermalPrinter && printNow) {
      setPrintNow(false);
    }
  }, [hasThermalPrinter, printNow]);

  const loadCatalog = async () => {
    const [catRes, prodRes, addonRes, promoRes] = await Promise.all([
      supabase.from('categories').select('id,name').eq('active', true).order('sort_order'),
      supabase.from('products').select('*').eq('active', true).eq('out_of_stock', false).order('name'),
      supabase.from('product_addons').select('*').eq('active', true).order('name'),
      supabase.from('promotions').select('*, promotion_products(product_id)').eq('active', true).order('created_at', { ascending: false }),
    ]);
    if (catRes.data) setCategories(catRes.data as { id: string; name: string }[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (addonRes.data) setAddons(addonRes.data as ProductAddon[]);
    if (promoRes.data) setPromotions(promoRes.data as Promotion[]);
  };

  const loadSessions = async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, table:tables!inner(id,name,table_type,token), orders:orders(*, items:order_items(*))')
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false });

    if (error) {
      toast(`Erro ao carregar sessoes: ${error.message}`, 'error');
      return;
    }

    const rows = ((data || []) as any[]).map((row) => ({
      ...row,
      table: row.table || null,
      orders: (row.orders || []) as (Order & { items?: OrderItem[] })[],
    })) as SessionWithDetails[];

    setSessions(rows);

    const token = profile?.id ? `counter-${profile.id}` : '';
    if (token) {
      setCounterSession(rows.find((session) => session.table?.token === token) || null);
    } else {
      setCounterSession(null);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadSessions();

    const channel = supabase
      .channel('counter_module_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, loadSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadSessions)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const getAddonsByProduct = (productId: string) => addons.filter((addon) => addon.product_id === productId);
  const getProductPricing = (product: Product) => {
    const promotion = resolvePromotionForProduct(product.id, promotions);
    return applyPromotionToPrice(product.price_cents || 0, promotion);
  };

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => {
      const category = categories.find((c) => c.id === product.category_id)?.name || '';
      const code = product.id.slice(0, 8);
      return `${product.name} ${product.description || ''} ${category} ${code}`.toLowerCase().includes(query);
    });
  }, [search, products, categories]);

  const openDiningSessions = useMemo(() => sessions.filter((session) => session.table?.table_type !== 'COUNTER'), [sessions]);

  const sessionOrderOptions = useMemo(() => {
    return openDiningSessions.flatMap((session) =>
      getVisibleOrders(session).map((order) => ({
        id: order.id,
        session_id: session.id,
        table_id: session.table_id,
        table_name: session.table?.name || 'Mesa',
        parent_order_id: order.parent_order_id || null,
        created_at: order.created_at,
        total_cents: order.total_cents || 0,
      }))
    );
  }, [openDiningSessions]);

  const subtotalCents = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.qty * item.unit_price_cents, 0),
    [cartItems]
  );
  const promotionDiscountCents = useMemo(
    () => cartItems.reduce((acc, item) => acc + Math.max(0, Number(item.promo_discount_cents || 0)) * item.qty, 0),
    [cartItems]
  );

  const discountValueNormalized = useMemo(() => {
    if (discountMode === 'AMOUNT') return parseMaskedCurrencyToCents(discountInput);
    if (discountMode === 'PERCENT') return parsePercent(discountInput);
    return 0;
  }, [discountInput, discountMode]);

  const discountCents = useMemo(() => {
    if (discountMode === 'AMOUNT') return Math.min(discountValueNormalized, subtotalCents);
    if (discountMode === 'PERCENT') return Math.round(subtotalCents * (discountValueNormalized / 100));
    return 0;
  }, [discountMode, discountValueNormalized, subtotalCents]);

  const isAdditionalMode = mode === 'ADDITIONAL';
  const hasSelectedServiceType = serviceType === 'RETIRADA' || serviceType === 'ENTREGA' || serviceType === 'CONSUMO_LOCAL';
  const shouldDisableAdditionalModeButton = mode !== 'ADDITIONAL' && hasSelectedServiceType;
  const deliveryFeeCents = useMemo(
    () => (serviceType === 'ENTREGA' ? parseMaskedCurrencyToCents(deliveryFeeInput) : 0),
    [serviceType, deliveryFeeInput]
  );
  const paymentMethodLabel = paymentMethodLabels[paymentMethod];
  const effectiveDiscountMode: DiscountMode = isAdditionalMode ? 'NONE' : discountMode;
  const effectiveDiscountValueNormalized = isAdditionalMode ? 0 : discountValueNormalized;
  const effectiveDiscountCents = isAdditionalMode ? 0 : discountCents;

  const totalCents = Math.max(0, subtotalCents - effectiveDiscountCents + deliveryFeeCents);

  const resetCart = () => {
    setCartItems([]);
    setDiscountMode('NONE');
    setDiscountInput('');
    setGeneralNote('');
    setServiceType('NONE');
    setCustomerName('Balcao');
    setCustomerPhone('');
    setDeliveryStreet('');
    setDeliveryNumber('');
    setDeliveryNeighborhood('');
    setDeliveryComplement('');
    setDeliveryReference('');
    setDeliveryFeeInput('R$ 0,00');
    setPaymentMethod('CARD');
    setCashChangeInput('R$ 0,00');
  };

  const activatePickup = () => {
    if (mode === 'ADDITIONAL') return;
    if (serviceType === 'RETIRADA') {
      setServiceType('NONE');
      return;
    }
    setServiceType('RETIRADA');
    if (!customerName.trim()) {
      setCustomerName('Balcao');
    }
  };

  const activateDelivery = () => {
    if (mode === 'ADDITIONAL') return;
    if (serviceType === 'ENTREGA') {
      setServiceType('NONE');
      setDeliveryFeeInput('R$ 0,00');
      return;
    }
    setServiceType('ENTREGA');
    const defaultFee = Math.max(0, Number(settings?.default_delivery_fee_cents || 0));
    setDeliveryFeeInput(formatCentsToMaskedCurrency(defaultFee));
    if ((customerName || '').trim().toLowerCase() === 'balcao') {
      setCustomerName('');
    }
  };

  const activateConsumoLocal = () => {
    if (mode === 'ADDITIONAL') return;
    if (serviceType === 'CONSUMO_LOCAL') {
      setServiceType('NONE');
      return;
    }
    setServiceType('CONSUMO_LOCAL');
    if (!customerName.trim()) {
      setCustomerName('Balcao');
    }
  };

  const openAddModal = (product: Product) => {
    setPendingProduct(product);
    setPendingQty(1);
    setPendingObservation('');
    setPendingAddonIds([]);
    setShowAddModal(true);
  };

  const addPendingProductToCart = () => {
    if (!pendingProduct) return;
    const selectedAddons = getAddonsByProduct(pendingProduct.id).filter((addon) => pendingAddonIds.includes(addon.id));
    const addonTotal = selectedAddons.reduce((acc, addon) => acc + addon.price_cents, 0);
    const pricing = getProductPricing(pendingProduct);
    const note = makeItemNote(selectedAddons.map((addon) => addon.name), pendingObservation);
    const unitPriceCents = pricing.finalUnitPriceCents + addonTotal;
    const qty = Math.max(1, pendingQty);
    const itemKey = `${pendingProduct.id}::${buildLineItemKey({
      name_snapshot: pendingProduct.name,
      unit_price_cents: unitPriceCents,
      note,
    })}`;

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => {
        const existingKey = `${item.product_id}::${buildLineItemKey({
          name_snapshot: item.product_name,
          unit_price_cents: item.unit_price_cents,
          note: makeItemNote(item.addon_names, item.observation),
        })}`;
        return existingKey === itemKey;
      });

      if (existingIndex < 0) {
        return [
          ...prev,
          {
            id: makeId(),
            product_id: pendingProduct.id,
            product_name: pendingProduct.name,
            qty,
            base_price_cents: pricing.originalUnitPriceCents,
            addon_total_cents: addonTotal,
            unit_price_cents: unitPriceCents,
            promo_name: pricing.promoName,
            promo_discount_type: pricing.promoDiscountType,
            promo_discount_value: pricing.promoDiscountValue,
            promo_discount_cents: pricing.discountCents,
            addon_names: selectedAddons.map((addon) => addon.name),
            observation: pendingObservation.trim(),
          },
        ];
      }

      return prev.map((item, index) =>
        index === existingIndex
          ? {
            ...item,
            qty: item.qty + qty,
          }
          : item
      );
    });

    setShowAddModal(false);
  };

  const resolveTarget = async () => {
    if (!profile) return { error: 'Perfil nao encontrado.' };

    if (mode === 'NEW') {
      let targetSession = counterSession;
      if (!targetSession) {
        const { data: sessionId, error } = await supabase.rpc('get_or_create_counter_session', {
          p_profile_id: profile.id,
          p_profile_name: profile.name || 'Operador',
        });
        if (error || !sessionId) return { error: error?.message || 'Nao foi possivel abrir sessao do balcao.' };

        const { data: loaded } = await supabase
          .from('sessions')
          .select('*, table:tables!inner(id,name,table_type,token), orders:orders(*, items:order_items(*))')
          .eq('id', sessionId)
          .maybeSingle();
        targetSession = loaded as SessionWithDetails;
      }

      if (!targetSession) return { error: 'Sessao de balcao indisponivel.' };

      return {
        session_id: targetSession.id,
        table_id: targetSession.table_id,
        parent_order_id: null as string | null,
        table_name: targetSession.table?.name || 'BALCAO',
      };
    }

    if (additionalLinkType === 'SESSION') {
      const targetSession = openDiningSessions.find((session) => session.id === selectedAdditionalSessionId);
      if (!targetSession) return { error: 'Selecione uma sessao para pedido adicional.' };

      const visible = getVisibleOrders(targetSession).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const rootOrderId = visible.find((order) => !order.parent_order_id)?.id || visible[0]?.id || null;

      return {
        session_id: targetSession.id,
        table_id: targetSession.table_id,
        parent_order_id: rootOrderId,
        table_name: targetSession.table?.name || 'Mesa',
      };
    }

    const targetOrder = sessionOrderOptions.find((order) => order.id === selectedAdditionalOrderId);
    if (!targetOrder) return { error: 'Selecione um pedido para adicional.' };

    return {
      session_id: targetOrder.session_id,
      table_id: targetOrder.table_id,
      parent_order_id: targetOrder.parent_order_id || targetOrder.id,
      table_name: targetOrder.table_name,
    };
  };

  const markPrinted = async (sessionId: string, orderIds: string[]) => {
    const { error } = await supabase.rpc('mark_orders_printed', {
      p_session_id: sessionId,
      p_order_ids: orderIds,
    });
    if (error) {
      toast(`Impresso, mas falhou ao marcar como impresso: ${error.message}`, 'error');
      return false;
    }
    return true;
  };

  const handleGenerateOrder = async () => {
    if (!profile) {
      toast('Usuario sem perfil valido.', 'error');
      return;
    }
    if (cartItems.length === 0) {
      toast('Carrinho vazio.', 'info');
      return;
    }

    if (mode === 'NEW' && !hasSelectedServiceType) {
      toast('Selecione Retirada ou Entrega para gerar novo pedido.', 'error');
      return;
    }

    if (mode === 'NEW' && serviceType === 'ENTREGA') {
      if (!customerName.trim()) {
        toast('Nome do cliente e obrigatorio para entrega.', 'error');
        return;
      }
      if (!deliveryStreet.trim() || !deliveryNumber.trim() || !deliveryNeighborhood.trim()) {
        toast('Preencha rua, numero e bairro para pedidos de entrega.', 'error');
        return;
      }
    }

    setLoading(true);
    const target = await resolveTarget();
    if ('error' in target) {
      setLoading(false);
      toast(target.error, 'error');
      return;
    }

    const payloadItems = groupOrderItems<CounterPayloadItem>(
      cartItems.map(
        (item): CounterPayloadItem => ({
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
          added_by_name: profile.name || 'Operador',
          status: 'PENDING',
        })
      )
    );

    const deliveryAddress: DeliveryAddress | null =
      mode === 'NEW' && serviceType === 'ENTREGA'
        ? {
          street: deliveryStreet.trim(),
          number: deliveryNumber.trim(),
          neighborhood: deliveryNeighborhood.trim(),
          complement: deliveryComplement.trim() || undefined,
          reference: deliveryReference.trim() || undefined,
        }
        : null;
    const rpcServiceType: ServiceType =
      mode === 'ADDITIONAL'
        ? 'ON_TABLE'
        : serviceType === 'ENTREGA'
          ? 'ENTREGA'
          : 'RETIRADA';

    const { data: orderId, error } = await supabase.rpc('create_staff_order', {
      p_session_id: target.session_id,
      p_table_id: target.table_id,
      p_origin: 'BALCAO',
      p_created_by_profile_id: profile.id,
      p_added_by_name: profile.name || 'Operador',
      p_parent_order_id: target.parent_order_id,
      p_customer_name:
        mode === 'ADDITIONAL'
          ? null
          : serviceType === 'ENTREGA'
            ? customerName.trim()
            : (customerName.trim() || 'Balcao'),
      p_customer_phone: mode === 'ADDITIONAL' ? null : (customerPhone.trim() || null),
      p_general_note: generalNote.trim() || null,
      p_service_type: rpcServiceType,
      p_delivery_address: deliveryAddress,
      p_delivery_fee_cents: mode === 'NEW' ? deliveryFeeCents : 0,
      p_discount_mode: effectiveDiscountMode,
      p_discount_value: effectiveDiscountValueNormalized,
      p_items: payloadItems,
    });

    if (error || !orderId) {
      setLoading(false);
      toast(error?.message || 'Nao foi possivel gerar pedido.', 'error');
      return;
    }

    if (printNow && hasThermalPrinter) {
      const { data: createdOrder } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('id', orderId)
        .maybeSingle();

      if (createdOrder) {
        const order = createdOrder as Order & { items?: OrderItem[] };
        const ticketType =
          order.service_type === 'ENTREGA'
            ? 'ENTREGA'
            : order.service_type === 'RETIRADA'
              ? 'RETIRADA'
              : order.origin === 'BALCAO'
                ? 'BALCAO'
                : 'MESA';
        const fallbackSubtotal = (order.items || []).reduce(
          (acc, item) => acc + (item.qty || 0) * (item.unit_price_cents || 0),
          0
        );
        const subtotalCents = Number(order.subtotal_cents ?? fallbackSubtotal);
        const deliveryFeeCents = Number(order.delivery_fee_cents || 0);
        const totalCentsResolved = Number(order.total_cents ?? Math.max(0, subtotalCents + deliveryFeeCents));
        let receiptToken = (order.receipt_token || '').trim() || null;

        if (shouldHaveReceiptToken(ticketType) && !receiptToken) {
          const { data: tokenData, error: tokenError } = await supabase.rpc('ensure_order_receipt_token', {
            p_order_id: order.id,
          });
          if (tokenError) {
            toast(`Pedido criado, mas falhou ao gerar token do cupom digital: ${tokenError.message}`, 'error');
          } else {
            const resolvedToken = String(tokenData || '').trim();
            if (resolvedToken) receiptToken = resolvedToken;
          }
        }

        const result = await printKitchenTicket({
          tickets: [
            {
              storeName: settings?.store_name || 'Loja',
              storeImageUrl: settings?.logo_url || null,
              orderId: order.id,
              ticketType,
              openedAt: order.created_at,
              closedAt: null,
              statusLabel: getTicketStatusLabel(order),
              orderTime: new Date(order.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              tableName: target.table_name || null,
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
              deliveryFeeCents,
              totalCents: totalCentsResolved,
              receiptToken: shouldHaveReceiptToken(ticketType) ? receiptToken : null,
              receiptUrl:
                shouldHaveReceiptToken(ticketType) && receiptToken
                  ? buildReceiptUrlFromToken(receiptToken)
                  : null,
            },
          ],
        });

        if (result.status === 'printed') {
          await markPrinted(target.session_id, [String(orderId)]);
          toast('Pedido gerado e impresso.', 'success');
        } else if (result.status === 'cancelled') {
          toast('Pedido criado, mas a impressao foi cancelada.', 'info');
        } else {
          toast(`Pedido criado, mas falhou ao imprimir: ${result.message}`, 'error');
        }
      } else {
        toast('Pedido criado, mas nao foi possivel montar a impressao.', 'error');
      }
    } else {
      toast('Pedido gerado sem impressao.', 'success');
    }

    setLoading(false);
    resetCart();
    loadSessions();
  };

  const handleCloseCounterSession = async () => {
    if (!counterSession) return;
    setLoading(true);

    await supabase.from('sessions').update({ status: 'EXPIRED', closed_at: new Date().toISOString() }).eq('id', counterSession.id);
    await supabase.from('tables').update({ status: 'FREE' }).eq('id', counterSession.table_id);

    setLoading(false);
    toast('Sessao do balcao encerrada.', 'success');
    loadSessions();
  };

  if (!counterEnabled) {
    return (
      <div className="bg-white border border-gray-200 rounded-[28px] p-10 text-center">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900">Modulo Balcao Desabilitado</h2>
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-3">
          Habilite o modulo em Configuracoes para permitir lancamentos no balcao.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-[28px] p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-gray-900">Balcao</h2>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2">PDV para lancamento de pedidos e adicionais</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
              <input
                type="checkbox"
                checked={printNow}
                disabled={!hasThermalPrinter}
                onChange={(e) => setPrintNow(e.target.checked)}
                aria-label="Imprimir agora"
              />
              Imprimir agora
            </label>
            {counterSession && (
              <button
                onClick={handleCloseCounterSession}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Encerrar sessao do operador
              </button>
            )}
          </div>
        </div>

        {!hasThermalPrinter && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              Impressao desativada: marque "Tenho impressora termica" em Configuracoes.
            </p>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Fluxo do pedido</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('NEW')}
                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mode === 'NEW' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                Novo
              </button>
              <button
                onClick={() => {
                  setMode('ADDITIONAL');
                  setServiceType('NONE');
                  setDeliveryStreet('');
                  setDeliveryNumber('');
                  setDeliveryNeighborhood('');
                  setDeliveryComplement('');
                  setDeliveryReference('');
                  setDeliveryFeeInput('R$ 0,00');
                }}
                disabled={shouldDisableAdditionalModeButton}
                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mode === 'ADDITIONAL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Adicional
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Tipo de atendimento</label>
            <div className="flex gap-2">
              <button
                onClick={activatePickup}
                disabled={mode === 'ADDITIONAL'}
                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mode === 'NEW' && serviceType === 'RETIRADA' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Retirada
              </button>
              <button
                onClick={activateDelivery}
                disabled={mode === 'ADDITIONAL'}
                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mode === 'NEW' && serviceType === 'ENTREGA' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Entrega
              </button>
              <button
                onClick={activateConsumoLocal}
                disabled={mode === 'ADDITIONAL'}
                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mode === 'NEW' && serviceType === 'CONSUMO_LOCAL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Consumo Local
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Cliente {mode === 'NEW' && serviceType === 'ENTREGA' ? '(obrigatorio)' : '(opcional)'}
            </label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={mode === 'NEW' && serviceType === 'ENTREGA' ? 'Nome do cliente' : 'Balcao'} className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {!(mode === 'ADDITIONAL' || (mode === 'NEW' && serviceType === 'CONSUMO_LOCAL')) && (
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Telefone (opcional)</label>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(00) 00000-0000" className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary" />
            </div>
          )}
          {mode === 'NEW' && serviceType === 'ENTREGA' && (
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Taxa de entrega (R$)</label>
              <input
                value={deliveryFeeInput}
                inputMode="numeric"
                onChange={(e) => setDeliveryFeeInput(maskCurrencyInput(e.target.value))}
                placeholder="R$ 0,00"
                className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
              />
            </div>
          )}
        </div>

        {mode === 'NEW' && serviceType === 'ENTREGA' && (
          <div className="grid lg:grid-cols-2 gap-4 border border-gray-100 rounded-2xl p-4 bg-gray-50">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Rua (obrigatorio)</label>
              <input value={deliveryStreet} onChange={(e) => setDeliveryStreet(e.target.value)} placeholder="Rua" className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary bg-white" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Numero (obrigatorio)</label>
              <input value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} placeholder="Numero" className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary bg-white" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Bairro (obrigatorio)</label>
              <input value={deliveryNeighborhood} onChange={(e) => setDeliveryNeighborhood(e.target.value)} placeholder="Bairro" className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary bg-white" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Complemento (opcional)</label>
              <input value={deliveryComplement} onChange={(e) => setDeliveryComplement(e.target.value)} placeholder="Apartamento, bloco..." className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary bg-white" />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Referencia (opcional)</label>
              <input value={deliveryReference} onChange={(e) => setDeliveryReference(e.target.value)} placeholder="Proximo ao mercado..." className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary bg-white" />
            </div>
          </div>
        )}

        {mode === 'ADDITIONAL' && (
          <div className="grid lg:grid-cols-3 gap-4 border border-gray-100 rounded-2xl p-4 bg-gray-50">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Vincular adicional por</label>
              <div className="flex gap-2">
                <button onClick={() => setAdditionalLinkType('SESSION')} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${additionalLinkType === 'SESSION' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                  Mesa/Sessao
                </button>
                <button onClick={() => setAdditionalLinkType('ORDER')} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${additionalLinkType === 'ORDER' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                  Pedido
                </button>
              </div>
            </div>

            {additionalLinkType === 'SESSION' ? (
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Sessao da mesa</label>
                <CustomSelect
                  value={selectedAdditionalSessionId}
                  onChange={setSelectedAdditionalSessionId}
                  options={[
                    { value: '', label: 'Selecione uma sessao' },
                    ...openDiningSessions.map((session) => ({
                      value: session.id,
                      label: `${session.table?.name || 'Mesa'} - Sessao #${session.id.slice(0, 6)}`,
                    })),
                  ]}
                  buttonClassName="p-3 text-sm font-bold"
                />
              </div>
            ) : (
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Pedido alvo</label>
                <CustomSelect
                  value={selectedAdditionalOrderId}
                  onChange={setSelectedAdditionalOrderId}
                  options={[
                    { value: '', label: 'Selecione um pedido' },
                    ...sessionOrderOptions.map((order) => ({
                      value: order.id,
                      label: `${order.table_name} - Pedido #${order.id.slice(0, 6)} (${formatCurrency(order.total_cents)})`,
                    })),
                  ]}
                  buttonClassName="p-3 text-sm font-bold"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1.25fr_0.95fr] gap-6">
        <section className="bg-white border border-gray-200 rounded-[28px] p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900">Produtos</h3>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome/codigo/categoria" className="w-full md:w-[320px] p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary" />
          </div>
          <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
            {filteredProducts.map((product) => (
              <div key={product.id} className="border border-gray-100 rounded-xl p-3 flex justify-between items-center gap-2">
                <div>
                  <p className="text-sm font-black text-gray-800">{product.name}</p>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">{(categories.find((category) => category.id === product.category_id)?.name || 'Categoria').toUpperCase()} • {product.id.slice(0, 8)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const pricing = getProductPricing(product);
                    return (
                      <div className="text-right">
                        {pricing.hasPromotion && (
                          <p className="text-[10px] text-gray-400 line-through font-black">{formatCurrency(product.price_cents)}</p>
                        )}
                        <span className="font-black text-gray-900">{formatCurrency(pricing.finalUnitPriceCents)}</span>
                      </div>
                    );
                  })()}
                  <button onClick={() => openAddModal(product)} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-[9px] font-black uppercase tracking-widest">Adicionar</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-[28px] p-6 space-y-4">
          <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900">Carrinho do balcao</h3>

          <div className="space-y-2 max-h-[30vh] overflow-auto pr-1">
            {cartItems.length === 0 && <p className="text-sm text-gray-400 font-bold">Nenhum item no carrinho.</p>}
            {cartItems.map((item) => (
              <div key={item.id} className="border border-gray-100 rounded-xl p-3 flex justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-gray-800">{item.qty}x {item.product_name}</p>
                  {item.addon_names.length > 0 && <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1">+ {item.addon_names.join(', ')}</p>}
                  {item.promo_discount_cents > 0 && (
                    <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mt-1">
                      Promocao: -{formatCurrency(item.promo_discount_cents)}
                    </p>
                  )}
                  {!!item.observation && <p className="text-[10px] text-gray-500 font-black mt-1">Obs: {item.observation}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-black text-gray-900">{formatCurrency(item.qty * item.unit_price_cents)}</span>
                  <button onClick={() => setCartItems((prev) => prev.filter((entry) => entry.id !== item.id))} className="text-[9px] text-red-500 font-black uppercase tracking-widest">Remover</button>
                </div>
              </div>
            ))}
          </div>

          <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-3">
            {promotionDiscountCents > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Desconto promocional</span>
                <span className="font-black text-emerald-600">- {formatCurrency(promotionDiscountCents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Subtotal</span>
              <span className="font-black text-gray-900">{formatCurrency(subtotalCents)}</span>
            </div>

            {!isAdditionalMode && (
              <>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Desconto</label>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <CustomSelect
                      value={discountMode}
                      onChange={(nextValue) => {
                        const nextMode = nextValue as DiscountMode;
                        setDiscountMode(nextMode);
                        if (nextMode === 'NONE') {
                          setDiscountInput('');
                          return;
                        }
                        if (nextMode === 'AMOUNT') {
                          setDiscountInput(maskCurrencyInput(discountInput));
                          return;
                        }
                        setDiscountInput('');
                      }}
                      options={[
                        { value: 'NONE', label: 'Nenhum' },
                        { value: 'AMOUNT', label: 'Valor' },
                        { value: 'PERCENT', label: 'Percentual' },
                      ]}
                      buttonClassName="p-2.5 rounded-lg text-sm"
                    />
                    <input
                      value={discountInput}
                      inputMode={discountMode === 'AMOUNT' ? 'numeric' : 'decimal'}
                      onChange={(e) => {
                        if (discountMode === 'AMOUNT') {
                          setDiscountInput(maskCurrencyInput(e.target.value));
                          return;
                        }
                        if (discountMode === 'PERCENT') {
                          const raw = e.target.value.replace(/[^\d.,]/g, '');
                          setDiscountInput(raw);
                          return;
                        }
                        setDiscountInput('');
                      }}
                      disabled={discountMode === 'NONE'}
                      placeholder={discountMode === 'PERCENT' ? '0 a 100' : 'R$ 0,00'}
                      className="p-2.5 rounded-lg border border-gray-200 font-bold bg-white disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Tipo de pagamento</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CARD')}
                      className={`rounded-xl border p-2.5 flex flex-col items-center gap-1.5 transition-all ${paymentMethod === 'CARD'
                        ? 'border-primary bg-primary/10 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <path d="M2 10h20" />
                      </svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">Cartao</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`rounded-xl border p-2.5 flex flex-col items-center gap-1.5 transition-all ${paymentMethod === 'CASH'
                        ? 'border-primary bg-primary/10 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <circle cx="12" cy="12" r="2.5" />
                        <path d="M6 12h.01M18 12h.01" />
                      </svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">Dinheiro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('PIX')}
                      className={`rounded-xl border p-2.5 flex flex-col items-center gap-1.5 transition-all ${paymentMethod === 'PIX'
                        ? 'border-primary bg-primary/10 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
                        <line x1="11" y1="5.5" x2="13" y2="5.5" />
                        <circle cx="12" cy="18.5" r="1" />
                      </svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">Pix</span>
                    </button>
                  </div>
                </div>

                {paymentMethod === 'CASH' && (
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-500">Troco (opcional)</label>
                    <input
                      value={cashChangeInput}
                      inputMode="numeric"
                      onChange={(e) => setCashChangeInput(maskCurrencyInput(e.target.value))}
                      placeholder="R$ 0,00"
                      className="w-[150px] p-3 rounded-xl border border-gray-200 font-bold bg-white text-right outline-none focus:border-primary"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Desconto aplicado</span>
                  <span className="font-black text-red-500">- {formatCurrency(effectiveDiscountCents)}</span>
                </div>
              </>
            )}

            {mode === 'NEW' && serviceType === 'ENTREGA' && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Taxa de entrega</span>
                <span className="font-black text-gray-900">+ {formatCurrency(deliveryFeeCents)}</span>
              </div>
            )}

            {!isAdditionalMode && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Pagamento</span>
                <span className="font-black text-gray-900">{paymentMethodLabel}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total</span>
              <span className="text-2xl font-black text-gray-900 tracking-tighter italic">{formatCurrency(totalCents)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Observacao geral (opcional)</label>
            <textarea rows={3} value={generalNote} onChange={(e) => setGeneralNote(e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:border-primary" placeholder="Ex.: retirar no balcao, sem canudo..." />
          </div>

          <button onClick={handleGenerateOrder} disabled={loading || cartItems.length === 0} className="w-full bg-primary text-white py-4 rounded-xl text-[11px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Gerando...' : printNow && hasThermalPrinter ? 'Gerar pedido e imprimir' : 'Gerar pedido sem imprimir'}
          </button>
        </section>
      </div>

      {showAddModal && pendingProduct && (
        <AppModal
          open={showAddModal && !!pendingProduct}
          onClose={() => setShowAddModal(false)}
          size="sm"
          zIndex={230}
          bodyClassName="space-y-5"
          title={
            <div>
              <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900">{pendingProduct.name}</h3>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">{formatCurrency(getProductPricing(pendingProduct).finalUnitPriceCents)}</p>
            </div>
          }
          footer={
            <button onClick={addPendingProductToCart} className="w-full bg-gray-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">
              Adicionar ao carrinho
            </button>
          }
        >

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Quantidade</label>
            <input type="number" min={1} value={pendingQty} onChange={(e) => setPendingQty(Math.max(1, Number(e.target.value) || 1))} className="w-full p-3 rounded-xl border border-gray-200 font-black outline-none focus:border-primary" />
          </div>

          {getAddonsByProduct(pendingProduct.id).length > 0 && (
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Adicionais</label>
              <div className="space-y-2 max-h-[180px] overflow-auto pr-1">
                {getAddonsByProduct(pendingProduct.id).map((addon) => {
                  const checked = pendingAddonIds.includes(addon.id);
                  return (
                    <label key={addon.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
                      <span className="text-sm font-black text-gray-700">{addon.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-primary">+ {formatCurrency(addon.price_cents)}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setPendingAddonIds((prev) => (e.target.checked ? [...prev, addon.id] : prev.filter((id) => id !== addon.id)))}
                          aria-label={`Selecionar adicional ${addon.name}`}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Observacao (opcional)</label>
            <textarea rows={3} value={pendingObservation} onChange={(e) => setPendingObservation(e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:border-primary" placeholder="Ex.: sem gelo, molho separado..." />
          </div>
        </AppModal>
      )}
    </div>
  );
};

export default AdminCounter;

