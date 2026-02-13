import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, supabase } from '../services/supabase';
import { printKitchenTicket } from '../services/kitchenPrint';
import { DeliveryAddress, DiscountMode, Order, OrderItem, Product, ProductAddon, Profile, ServiceType, Session, StoreSettings } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

type SessionWithDetails = Session & {
  table?: { id: string; name: string; table_type?: string; token?: string } | null;
  orders?: (Order & { items?: OrderItem[] })[];
};

type CounterCartItem = {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price_cents: number;
  addon_names: string[];
  observation: string;
};

interface AdminCounterProps {
  profile: Profile | null;
  settings: StoreSettings | null;
}

const makeId = () => Math.random().toString(36).slice(2);

const parseMoneyToCents = (value: string) => {
  const normalized = (value || '').replace(',', '.').replace(/[^\d.]/g, '');
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100));
};

const parsePercent = (value: string) => {
  const numeric = Number((value || '').replace(',', '.'));
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

const AdminCounter: React.FC<AdminCounterProps> = ({ profile, settings }) => {
  const { toast } = useFeedback();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
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
  const [serviceType, setServiceType] = useState<ServiceType>('RETIRADA');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('0');

  const [discountMode, setDiscountMode] = useState<DiscountMode>('NONE');
  const [discountInput, setDiscountInput] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQty, setPendingQty] = useState(1);
  const [pendingObservation, setPendingObservation] = useState('');
  const [pendingAddonIds, setPendingAddonIds] = useState<string[]>([]);

  const counterEnabled = settings?.enable_counter_module !== false;

  const loadCatalog = async () => {
    const [catRes, prodRes, addonRes] = await Promise.all([
      supabase.from('categories').select('id,name').eq('active', true).order('sort_order'),
      supabase.from('products').select('*').eq('active', true).eq('out_of_stock', false).order('name'),
      supabase.from('product_addons').select('*').eq('active', true).order('name'),
    ]);
    if (catRes.data) setCategories(catRes.data as { id: string; name: string }[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (addonRes.data) setAddons(addonRes.data as ProductAddon[]);
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

  const discountValueNormalized = useMemo(() => {
    if (discountMode === 'AMOUNT') return parseMoneyToCents(discountInput);
    if (discountMode === 'PERCENT') return parsePercent(discountInput);
    return 0;
  }, [discountInput, discountMode]);

  const discountCents = useMemo(() => {
    if (discountMode === 'AMOUNT') return Math.min(discountValueNormalized, subtotalCents);
    if (discountMode === 'PERCENT') return Math.round(subtotalCents * (discountValueNormalized / 100));
    return 0;
  }, [discountMode, discountValueNormalized, subtotalCents]);

  const deliveryFeeCents = useMemo(
    () => (serviceType === 'ENTREGA' ? parseMoneyToCents(deliveryFeeInput) : 0),
    [serviceType, deliveryFeeInput]
  );

  const totalCents = Math.max(0, subtotalCents - discountCents + deliveryFeeCents);

  const resetCart = () => {
    setCartItems([]);
    setDiscountMode('NONE');
    setDiscountInput('');
    setGeneralNote('');
    setServiceType('RETIRADA');
    setCustomerName('Balcao');
    setCustomerPhone('');
    setDeliveryStreet('');
    setDeliveryNumber('');
    setDeliveryNeighborhood('');
    setDeliveryComplement('');
    setDeliveryReference('');
    setDeliveryCity('');
    setDeliveryFeeInput('0');
  };

  const activatePickup = () => {
    setServiceType('RETIRADA');
    if (!customerName.trim()) {
      setCustomerName('Balcao');
    }
  };

  const activateDelivery = () => {
    setServiceType('ENTREGA');
    const defaultFee = Math.max(0, Number(settings?.default_delivery_fee_cents || 0));
    setDeliveryFeeInput((defaultFee / 100).toFixed(2));
    if ((customerName || '').trim().toLowerCase() === 'balcao') {
      setCustomerName('');
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

    setCartItems((prev) => [
      ...prev,
      {
        id: makeId(),
        product_id: pendingProduct.id,
        product_name: pendingProduct.name,
        qty: Math.max(1, pendingQty),
        unit_price_cents: (pendingProduct.price_cents || 0) + addonTotal,
        addon_names: selectedAddons.map((addon) => addon.name),
        observation: pendingObservation.trim(),
      },
    ]);

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

    if (serviceType === 'ENTREGA') {
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

    const payloadItems = cartItems.map((item) => ({
      product_id: item.product_id,
      name_snapshot: item.product_name,
      unit_price_cents: item.unit_price_cents,
      qty: item.qty,
      note: makeItemNote(item.addon_names, item.observation),
      added_by_name: profile.name || 'Operador',
      status: 'PENDING',
    }));

    const deliveryAddress: DeliveryAddress | null =
      serviceType === 'ENTREGA'
        ? {
            street: deliveryStreet.trim(),
            number: deliveryNumber.trim(),
            neighborhood: deliveryNeighborhood.trim(),
            complement: deliveryComplement.trim() || undefined,
            reference: deliveryReference.trim() || undefined,
            city: deliveryCity.trim() || undefined,
          }
        : null;

    const { data: orderId, error } = await supabase.rpc('create_staff_order', {
      p_session_id: target.session_id,
      p_table_id: target.table_id,
      p_origin: 'BALCAO',
      p_created_by_profile_id: profile.id,
      p_added_by_name: profile.name || 'Operador',
      p_parent_order_id: target.parent_order_id,
      p_customer_name: serviceType === 'ENTREGA' ? customerName.trim() : (customerName.trim() || 'Balcao'),
      p_customer_phone: customerPhone.trim() || null,
      p_general_note: generalNote.trim() || null,
      p_service_type: serviceType,
      p_delivery_address: deliveryAddress,
      p_delivery_fee_cents: deliveryFeeCents,
      p_discount_mode: discountMode,
      p_discount_value: discountValueNormalized,
      p_items: payloadItems,
    });

    if (error || !orderId) {
      setLoading(false);
      toast(error?.message || 'Nao foi possivel gerar pedido.', 'error');
      return;
    }

    if (printNow) {
      const { data: createdOrder } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('id', orderId)
        .maybeSingle();

      if (createdOrder) {
        const order = createdOrder as Order & { items?: OrderItem[] };
        const deliveryLines =
          serviceType === 'ENTREGA' && deliveryAddress
            ? [
                `${deliveryAddress.street}, ${deliveryAddress.number} - ${deliveryAddress.neighborhood}`,
                [deliveryAddress.complement, deliveryAddress.reference, deliveryAddress.city].filter(Boolean).join(' | '),
                customerPhone.trim() ? `Tel: ${customerPhone.trim()}` : '',
              ].filter(Boolean)
            : [];

        const result = await printKitchenTicket({
          storeName: settings?.store_name || 'Parada do Lanche',
          tableName: target.table_name || 'BALCAO',
          filterLabel: `Pedido #${String(orderId).slice(0, 6)}`,
          ticketTitle:
            serviceType === 'ENTREGA'
              ? (customerName.trim() || order.customer_name || 'Cliente')
              : 'COMANDA BALCAO',
          orderTypeLabel: serviceType === 'ENTREGA' ? 'ENTREGA' : 'RETIRADA',
          deliveryDetails: deliveryLines,
          openedAt: new Date().toISOString(),
          closedAt: null,
          totalCents: order.total_cents || 0,
          orders: [
            {
              id: order.id,
              created_at: order.created_at,
              total_cents: order.total_cents || 0,
              approval_label: 'Confirmado',
              items: (order.items || []).map((item) => ({
                name_snapshot: item.name_snapshot,
                qty: item.qty || 0,
                unit_price_cents: item.unit_price_cents || 0,
                note: item.note || '',
                added_by_name: item.added_by_name || profile.name || 'Operador',
              })),
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
              <input type="checkbox" checked={printNow} onChange={(e) => setPrintNow(e.target.checked)} className="w-4 h-4 accent-primary" />
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

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Fluxo do pedido</label>
            <div className="flex gap-2">
              <button onClick={() => setMode('NEW')} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mode === 'NEW' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                Novo
              </button>
              <button onClick={() => setMode('ADDITIONAL')} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${mode === 'ADDITIONAL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                Adicional
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Tipo de atendimento</label>
            <div className="flex gap-2">
              <button
                onClick={activatePickup}
                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${serviceType === 'RETIRADA' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                Retirada
              </button>
              <button
                onClick={activateDelivery}
                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${serviceType === 'ENTREGA' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                Entrega
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Cliente {serviceType === 'ENTREGA' ? '(obrigatorio)' : '(opcional)'}
            </label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={serviceType === 'ENTREGA' ? 'Nome do cliente' : 'Balcao'} className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Telefone (opcional)</label>
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(00) 00000-0000" className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary" />
          </div>
          {serviceType === 'ENTREGA' && (
            <>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Taxa de entrega (R$)</label>
                <input
                  value={deliveryFeeInput}
                  onChange={(e) => setDeliveryFeeInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Cidade (opcional)</label>
                <input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} placeholder="Cidade" className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary" />
              </div>
            </>
          )}
        </div>

        {serviceType === 'ENTREGA' && (
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
                <select value={selectedAdditionalSessionId} onChange={(e) => setSelectedAdditionalSessionId(e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary bg-white">
                  <option value="">Selecione uma sessao</option>
                  {openDiningSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.table?.name || 'Mesa'} - Sessao #{session.id.slice(0, 6)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Pedido alvo</label>
                <select value={selectedAdditionalOrderId} onChange={(e) => setSelectedAdditionalOrderId(e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary bg-white">
                  <option value="">Selecione um pedido</option>
                  {sessionOrderOptions.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.table_name} - Pedido #{order.id.slice(0, 6)} ({formatCurrency(order.total_cents)})
                    </option>
                  ))}
                </select>
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
                  <span className="font-black text-gray-900">{formatCurrency(product.price_cents)}</span>
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
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Subtotal</span>
              <span className="font-black text-gray-900">{formatCurrency(subtotalCents)}</span>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Desconto</label>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as DiscountMode)} className="p-2.5 rounded-lg border border-gray-200 font-black bg-white">
                  <option value="NONE">Nenhum</option>
                  <option value="AMOUNT">Valor</option>
                  <option value="PERCENT">Percentual</option>
                </select>
                <input value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} disabled={discountMode === 'NONE'} placeholder={discountMode === 'PERCENT' ? '0 a 100' : '0,00'} className="p-2.5 rounded-lg border border-gray-200 font-bold bg-white disabled:opacity-50" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Desconto aplicado</span>
              <span className="font-black text-red-500">- {formatCurrency(discountCents)}</span>
            </div>

            {serviceType === 'ENTREGA' && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Taxa de entrega</span>
                <span className="font-black text-gray-900">+ {formatCurrency(deliveryFeeCents)}</span>
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
            {loading ? 'Gerando...' : printNow ? 'Gerar pedido e imprimir' : 'Gerar pedido sem imprimir'}
          </button>
        </section>
      </div>

      {showAddModal && pendingProduct && (
        <div className="fixed inset-0 z-[230] bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] border border-gray-200 p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900">{pendingProduct.name}</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">{formatCurrency(pendingProduct.price_cents)}</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 font-black">Fechar</button>
            </div>

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
                            className="w-4 h-4 accent-primary"
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

            <button onClick={addPendingProductToCart} className="w-full bg-gray-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">
              Adicionar ao carrinho
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCounter;

