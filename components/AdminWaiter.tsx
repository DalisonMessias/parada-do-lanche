import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, supabase } from '../services/supabase';
import { printKitchenTicket } from '../services/kitchenPrint';
import { Order, OrderItem, Product, ProductAddon, Profile, Session, StoreSettings } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

type SessionWithDetails = Session & {
  table?: { id: string; name: string; table_type?: string; status?: string } | null;
  orders?: (Order & { items?: OrderItem[] })[];
};

type WaiterDraftItem = {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price_cents: number;
  addon_names: string[];
  addon_total_cents: number;
  observation: string;
};

interface AdminWaiterProps {
  profile: Profile | null;
  settings: StoreSettings | null;
}

const toId = () => Math.random().toString(36).slice(2);

const parseOrderItemsCount = (orders: (Order & { items?: OrderItem[] })[]) =>
  orders.reduce((acc, order) => {
    if (order.status === 'CANCELLED' || order.approval_status === 'REJECTED') return acc;
    return acc + (order.items || []).reduce((sum, item) => sum + (item.qty || 0), 0);
  }, 0);

const getSessionPartialTotal = (orders: (Order & { items?: OrderItem[] })[]) =>
  orders.reduce((acc, order) => {
    if (order.status === 'CANCELLED' || order.approval_status === 'REJECTED') return acc;
    if (order.approval_status !== 'APPROVED') return acc;
    return acc + (order.total_cents || 0);
  }, 0);

const makeItemNote = (addonNames: string[], observation: string) => {
  const lines: string[] = [];
  if (addonNames.length > 0) lines.push(`Adicionais: ${addonNames.join(', ')}`);
  const cleanObs = observation.trim();
  if (cleanObs) lines.push(`Observacao: ${cleanObs}`);
  return lines.length > 0 ? lines.join('\n') : null;
};

const AdminWaiter: React.FC<AdminWaiterProps> = ({ profile, settings }) => {
  const { toast } = useFeedback();
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [draftItems, setDraftItems] = useState<WaiterDraftItem[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQty, setPendingQty] = useState(1);
  const [pendingObservation, setPendingObservation] = useState('');
  const [pendingAddonIds, setPendingAddonIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isWaiter = profile?.role === 'WAITER';

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, table:tables!inner(id,name,table_type,status), orders:orders(*, items:order_items(*))')
      .eq('status', 'OPEN')
      .eq('table.table_type', 'DINING')
      .order('created_at', { ascending: false });

    if (error) {
      toast(`Erro ao carregar mesas: ${error.message}`, 'error');
      return;
    }

    const normalized = ((data || []) as any[]).map((row) => ({
      ...row,
      table: row.table || null,
      orders: (row.orders || []) as (Order & { items?: OrderItem[] })[],
    })) as SessionWithDetails[];
    setSessions(normalized);
  };

  const fetchCatalog = async () => {
    const [catRes, prodRes, addonRes] = await Promise.all([
      supabase.from('categories').select('id,name').eq('active', true).order('sort_order'),
      supabase.from('products').select('*').eq('active', true).eq('out_of_stock', false).order('name'),
      supabase.from('product_addons').select('*').eq('active', true).order('name'),
    ]);

    if (catRes.data) setCategories(catRes.data as { id: string; name: string }[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (addonRes.data) setAddons(addonRes.data as ProductAddon[]);
  };

  useEffect(() => {
    fetchSessions();
    fetchCatalog();

    const channel = supabase
      .channel('waiter_module_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, fetchSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchSessions)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => {
      const tableName = session.table?.name?.toLowerCase() || '';
      const sessionCode = session.id.slice(0, 8).toLowerCase();
      return tableName.includes(query) || sessionCode.includes(query);
    });
  }, [search, sessions]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const visibleOrders = useMemo(() => {
    if (!selectedSession) return [];
    return (selectedSession.orders || [])
      .filter((order) => order.approval_status !== 'REJECTED')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [selectedSession]);

  const waiterUnprintedOrders = useMemo(
    () => visibleOrders.filter((order) => order.origin === 'WAITER' && !order.printed_at),
    [visibleOrders]
  );

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => {
      const category = categories.find((c) => c.id === product.category_id)?.name || '';
      const code = product.id.slice(0, 8);
      return `${product.name} ${product.description || ''} ${category} ${code}`.toLowerCase().includes(query);
    });
  }, [productSearch, products, categories]);

  const draftSubtotal = useMemo(
    () => draftItems.reduce((acc, item) => acc + item.unit_price_cents * item.qty, 0),
    [draftItems]
  );

  const getAddonsByProduct = (productId: string) => addons.filter((addon) => addon.product_id === productId);

  const openAddModal = (product: Product) => {
    setPendingProduct(product);
    setPendingQty(1);
    setPendingObservation('');
    setPendingAddonIds([]);
    setShowAddModal(true);
  };

  const addDraftItem = () => {
    if (!pendingProduct) return;
    const selectedAddons = getAddonsByProduct(pendingProduct.id).filter((addon) => pendingAddonIds.includes(addon.id));
    const addonTotal = selectedAddons.reduce((acc, addon) => acc + addon.price_cents, 0);
    const item: WaiterDraftItem = {
      id: toId(),
      product_id: pendingProduct.id,
      product_name: pendingProduct.name,
      qty: Math.max(1, pendingQty),
      unit_price_cents: (pendingProduct.price_cents || 0) + addonTotal,
      addon_names: selectedAddons.map((addon) => addon.name),
      addon_total_cents: addonTotal,
      observation: pendingObservation.trim(),
    };
    setDraftItems((prev) => [...prev, item]);
    setShowAddModal(false);
  };

  const handleSendAdditionalItems = async () => {
    if (!selectedSession || draftItems.length === 0 || !profile) return;

    setSaving(true);
    const rootOrderId = visibleOrders.find((order) => !order.parent_order_id)?.id || visibleOrders[0]?.id || null;

    const payloadItems = draftItems.map((item) => ({
      product_id: item.product_id,
      name_snapshot: item.product_name,
      unit_price_cents: item.unit_price_cents,
      qty: item.qty,
      note: makeItemNote(item.addon_names, item.observation),
      added_by_name: profile.name || 'Garcom',
      status: 'PENDING',
    }));

    const { data: orderId, error } = await supabase.rpc('create_staff_order', {
      p_session_id: selectedSession.id,
      p_table_id: selectedSession.table_id,
      p_origin: 'WAITER',
      p_created_by_profile_id: profile.id,
      p_added_by_name: profile.name || 'Garcom',
      p_parent_order_id: rootOrderId,
      p_customer_name: null,
      p_customer_phone: null,
      p_general_note: null,
      p_discount_mode: 'NONE',
      p_discount_value: 0,
      p_items: payloadItems,
    });

    setSaving(false);

    if (error || !orderId) {
      toast(error?.message || 'Erro ao adicionar itens na mesa.', 'error');
      return;
    }

    setDraftItems([]);
    toast('Itens adicionais enviados para a mesa.', 'success');
    fetchSessions();
  };

  const markOrdersPrinted = async (sessionId: string, orderIds: string[]) => {
    if (orderIds.length === 0) {
      toast('Nao ha pedidos para imprimir neste filtro.', 'info');
      return;
    }

    const { error } = await supabase.rpc('mark_orders_printed', {
      p_session_id: sessionId,
      p_order_ids: orderIds,
    });

    if (error) {
      toast(`Impresso, mas falhou ao marcar como impresso: ${error.message}`, 'error');
      return;
    }
    fetchSessions();
  };

  const printOrders = async (orders: (Order & { items?: OrderItem[] })[], filterLabel: string) => {
    if (!selectedSession || orders.length === 0) {
      toast('Nao ha pedidos para imprimir neste filtro.', 'info');
      return;
    }

    const result = await printKitchenTicket({
      storeName: settings?.store_name || 'Parada do Lanche',
      tableName: selectedSession.table?.name || 'Mesa',
      filterLabel,
      openedAt: selectedSession.created_at,
      closedAt: selectedSession.closed_at || null,
      totalCents: orders.reduce((acc, order) => acc + (order.total_cents || 0), 0),
      orders: orders.map((order) => ({
        id: order.id,
        created_at: order.created_at,
        total_cents: order.total_cents || 0,
        approval_label:
          order.approval_status === 'PENDING_APPROVAL'
            ? 'Aguardando aceite'
            : order.approval_status === 'REJECTED'
              ? 'Rejeitado'
              : 'Confirmado',
        items: (order.items || []).map((item) => ({
          name_snapshot: item.name_snapshot,
          qty: item.qty || 0,
          unit_price_cents: item.unit_price_cents || 0,
          note: item.note || '',
          added_by_name: item.added_by_name || profile?.name || 'Garcom',
        })),
      })),
    });

    if (result.status === 'error') {
      toast(`Nao foi possivel iniciar a impressao: ${result.message}`, 'error');
      return;
    }
    if (result.status === 'cancelled') {
      toast('Impressao cancelada. Nenhum cupom foi marcado como impresso.', 'info');
      return;
    }

    await markOrdersPrinted(
      selectedSession.id,
      orders.map((order) => order.id)
    );
  };

  if (!isWaiter) {
    return (
      <div className="bg-white border border-gray-200 rounded-[28px] p-10 text-center">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900">Acesso Restrito</h2>
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-3">
          Este modulo esta disponivel apenas para o perfil Garcom.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-[28px] p-6 flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-gray-900">Garcom</h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2">Mesas abertas e lancamento de adicionais</p>
        </div>
        <div className="w-full md:w-[340px]">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Buscar mesa/codigo</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex: mesa 01 ou codigo"
            className="mt-2 w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredSessions.map((session) => {
          const orders = session.orders || [];
          const total = getSessionPartialTotal(orders);
          const itemsCount = parseOrderItemsCount(orders);
          return (
            <div key={session.id} className="bg-white border border-gray-200 rounded-[24px] p-5 space-y-4">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900">{session.table?.name || 'Mesa'}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                  Sessao #{session.id.slice(0, 6)} • {new Date(session.created_at).toLocaleTimeString('pt-BR')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                  <p className="text-[8px] uppercase tracking-widest font-black text-gray-400">Itens</p>
                  <p className="text-lg font-black text-gray-800">{itemsCount}</p>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                  <p className="text-[8px] uppercase tracking-widest font-black text-gray-400">Total parcial</p>
                  <p className="text-lg font-black text-gray-900">{formatCurrency(total)}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedSessionId(session.id);
                  setDraftItems([]);
                  setProductSearch('');
                }}
                className="w-full bg-gray-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest"
              >
                Entrar na mesa
              </button>
            </div>
          );
        })}
        {filteredSessions.length === 0 && (
          <div className="col-span-full bg-white border border-gray-200 rounded-[24px] p-10 text-center">
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">Nenhuma mesa aberta encontrada</p>
          </div>
        )}
      </div>

      {selectedSession && (
        <div className="fixed inset-0 z-[210] bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-7xl bg-white rounded-t-[28px] sm:rounded-[30px] border border-gray-200 p-5 sm:p-8 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900">{selectedSession.table?.name || 'Mesa'}</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  Sessao #{selectedSession.id.slice(0, 6)} • Aberta em {new Date(selectedSession.created_at).toLocaleTimeString('pt-BR')}
                </p>
              </div>
              <button onClick={() => setSelectedSessionId(null)} className="text-gray-400 font-black">Fechar</button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <section className="border border-gray-100 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Pedidos da mesa</h4>
                <div className="space-y-3 max-h-[42vh] overflow-auto pr-1">
                  {visibleOrders.length === 0 && (
                    <p className="text-sm text-gray-400 font-bold">Nenhum pedido enviado.</p>
                  )}
                  {visibleOrders.map((order) => (
                    <div key={order.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-gray-800">
                          Pedido #{order.id.slice(0, 6)} • {new Date(order.created_at).toLocaleTimeString('pt-BR')}
                        </p>
                        <span className="px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest bg-gray-50 border-gray-200 text-gray-600">
                          {order.origin || 'CUSTOMER'}
                        </span>
                      </div>
                      {(order.items || []).map((item) => (
                        <div key={item.id} className="flex justify-between items-start gap-2 border-t border-gray-50 pt-2">
                          <div>
                            <p className="text-sm font-black text-gray-700">{item.qty}x {item.name_snapshot}</p>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Pedido por {item.added_by_name}</p>
                            {item.note && <p className="text-[10px] text-gray-500 font-black mt-1 whitespace-pre-line">{item.note}</p>}
                          </div>
                          <span className="font-black text-gray-800">{formatCurrency((item.qty || 0) * (item.unit_price_cents || 0))}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>

              <section className="border border-gray-100 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Adicionar novos itens</h4>
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar produto"
                    className="w-[220px] p-2.5 rounded-lg border border-gray-200 text-sm font-bold outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-2 max-h-[28vh] overflow-auto pr-1">
                  {filteredProducts.map((product) => (
                    <div key={product.id} className="border border-gray-100 rounded-xl p-3 flex justify-between items-center gap-2">
                      <div>
                        <p className="text-sm font-black text-gray-800">{product.name}</p>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                          {(categories.find((category) => category.id === product.category_id)?.name || 'Categoria').toUpperCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-gray-900">{formatCurrency(product.price_cents)}</span>
                        <button
                          onClick={() => openAddModal(product)}
                          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-[9px] font-black uppercase tracking-widest"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Novos itens (nao enviados)</p>
                  <div className="space-y-2 max-h-[22vh] overflow-auto pr-1">
                    {draftItems.length === 0 && <p className="text-sm text-gray-400 font-bold">Nenhum item adicionado.</p>}
                    {draftItems.map((item) => (
                      <div key={item.id} className="border border-gray-100 rounded-xl p-3 flex justify-between gap-2">
                        <div>
                          <p className="text-sm font-black text-gray-800">{item.qty}x {item.product_name}</p>
                          {item.addon_names.length > 0 && (
                            <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1">
                              + {item.addon_names.join(', ')}
                            </p>
                          )}
                          {!!item.observation && <p className="text-[10px] text-gray-500 font-black mt-1">Obs: {item.observation}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-sm font-black text-gray-900">{formatCurrency(item.unit_price_cents * item.qty)}</span>
                          <button
                            onClick={() => setDraftItems((prev) => prev.filter((entry) => entry.id !== item.id))}
                            className="text-[9px] text-red-500 font-black uppercase tracking-widest"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Subtotal dos novos itens</p>
                    <p className="text-lg font-black text-gray-900">{formatCurrency(draftSubtotal)}</p>
                  </div>
                  <button
                    onClick={handleSendAdditionalItems}
                    disabled={draftItems.length === 0 || saving}
                    className="w-full mt-2 bg-primary text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Enviando...' : 'Enviar itens adicionais'}
                  </button>
                </div>
              </section>
            </div>

            <div className="border-t border-gray-100 pt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => printOrders(waiterUnprintedOrders, 'Somente itens novos do garcom')}
                disabled={waiterUnprintedOrders.length === 0}
                className="px-4 py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Imprimir novos itens
              </button>
              <button
                onClick={() => printOrders(visibleOrders, 'Todos os pedidos da mesa')}
                disabled={visibleOrders.length === 0}
                className="px-4 py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Imprimir tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && pendingProduct && (
        <div className="fixed inset-0 z-[220] bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] border border-gray-200 p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900">{pendingProduct.name}</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  {formatCurrency(pendingProduct.price_cents)}
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 font-black">Fechar</button>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Quantidade</label>
              <input
                type="number"
                min={1}
                value={pendingQty}
                onChange={(e) => setPendingQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-full p-3 rounded-xl border border-gray-200 font-black outline-none focus:border-primary"
              />
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
                            onChange={(e) =>
                              setPendingAddonIds((prev) =>
                                e.target.checked ? [...prev, addon.id] : prev.filter((id) => id !== addon.id)
                              )
                            }
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
              <textarea
                rows={3}
                value={pendingObservation}
                onChange={(e) => setPendingObservation(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:border-primary"
                placeholder="Ex.: sem cebola, molho separado..."
              />
            </div>

            <button
              onClick={addDraftItem}
              className="w-full bg-gray-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest"
            >
              Adicionar aos novos itens
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWaiter;
