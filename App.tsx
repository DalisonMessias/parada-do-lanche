
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { supabase, formatCurrency } from './services/supabase';
import { AppView, Table, Session, Guest, CartItem, Category, Product, ProductAddon, StoreSettings, Profile, UserRole, Order } from './types';
import Layout from './components/Layout';
import AdminOrders from './components/AdminOrders';
import AdminTables from './components/AdminTables';
import AdminMenu from './components/AdminMenu';
import AdminSettings from './components/AdminSettings';
import AdminStaff from './components/AdminStaff';
import AdminWaiter from './components/AdminWaiter';
import AdminCounter from './components/AdminCounter';
import { useFeedback } from './components/feedback/FeedbackProvider';

type AdminTab =
  | 'ACTIVE_TABLES'
  | 'FINISHED_ORDERS'
  | 'TABLES'
  | 'MENU'
  | 'SETTINGS'
  | 'STAFF'
  | 'WAITER_MODULE'
  | 'COUNTER_MODULE';

const getAllowedAdminTabs = (
  role: UserRole,
  counterEnabled: boolean
): AdminTab[] => {
  if (role === 'WAITER') {
    return ['WAITER_MODULE'];
  }

  const tabs: AdminTab[] = ['ACTIVE_TABLES', 'FINISHED_ORDERS', 'TABLES', 'MENU'];
  if (counterEnabled) tabs.push('COUNTER_MODULE');
  if (role === 'ADMIN') {
    tabs.push('SETTINGS');
    tabs.push('STAFF');
  }
  return tabs;
};

const playLocalBeep = () => {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.02;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch {
    // noop
  }
};

const App: React.FC = () => {
  const adminAccessKey = ((import.meta as any).env?.VITE_ADMIN_ACCESS_KEY || '').trim();
  const tempRegisterEnabled = ((import.meta as any).env?.VITE_ENABLE_TEMP_REGISTER || '').trim().toLowerCase() === 'true';
  const adminHash = adminAccessKey ? `/admin/${adminAccessKey}` : '/admin';
  const [view, setView] = useState<AppView>('LANDING');
  const [activeTable, setActiveTable] = useState<Table | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [showAddonSelector, setShowAddonSelector] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [productObservation, setProductObservation] = useState('');
  const [sessionOrders, setSessionOrders] = useState<Order[]>([]);
  const [tempRegisterStatus, setTempRegisterStatus] = useState('');
  const [adminTab, setAdminTab] = useState<AdminTab>('ACTIVE_TABLES');
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [isDesktopAdmin, setIsDesktopAdmin] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const [isLoading, setIsLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [user, setUser] = useState<any>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastNotificationRef = useRef<string>('');
  const { toast, confirm } = useFeedback();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) setProfile(data);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    if (data) setSettings(data);
  };

  const pushLocalNotification = async (title: string, body: string, tag: string) => {
    const dedupeKey = `${tag}:${title}:${body}`;
    if (lastNotificationRef.current === dedupeKey) return;
    lastNotificationRef.current = dedupeKey;
    setTimeout(() => {
      if (lastNotificationRef.current === dedupeKey) lastNotificationRef.current = '';
    }, 1200);

    playLocalBeep();
    toast(body, 'info');

    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission !== 'granted') return;

      const reg = swRegistrationRef.current;
      if (reg?.active) {
        reg.active.postMessage({ type: 'SHOW_NOTIFICATION', title, body, tag });
      } else {
        new Notification(title, { body, tag });
      }
    } catch {
      // noop
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktopAdmin(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('admin_sidebar_open');
    if (stored === '1') {
      setAdminSidebarOpen(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('admin_sidebar_open', adminSidebarOpen ? '1' : '0');
  }, [adminSidebarOpen]);

  useEffect(() => {
    if (view !== 'ADMIN_DASHBOARD' || !user) return;

    const role = profile?.role || 'WAITER';
    const canAccessCounter = settings?.enable_counter_module !== false;
    const allowedTabs = getAllowedAdminTabs(role, canAccessCounter);
    if (!allowedTabs.includes(adminTab)) {
      setAdminTab(allowedTabs[0] || 'ACTIVE_TABLES');
    }
  }, [view, user, profile?.role, settings?.enable_counter_module, adminTab]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        swRegistrationRef.current = reg;
      })
      .catch(() => {
        swRegistrationRef.current = null;
      });
  }, []);

  useEffect(() => {
    const handleHash = async () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/m/')) {
        const token = hash.split('/m/')[1];
        const { data: table } = await supabase.from('tables').select('*').eq('token', token).single();
        if (table) {
          setActiveTable(table);
          const { data: activeSession } = await supabase.from('sessions').select('*').eq('table_id', table.id).eq('status', 'OPEN').maybeSingle();
          if (activeSession) {
            setSession(activeSession);
            const savedGuest = localStorage.getItem(`guest_${activeSession.id}`);
            if (savedGuest) setGuest(JSON.parse(savedGuest));
          }
          setView('CUSTOMER_MENU');
        }
      } else if (hash === '#/cadastro-temp') {
        setView(tempRegisterEnabled ? 'TEMP_REGISTER' : 'LANDING');
      } else if (hash.startsWith('#/admin')) {
        const clean = hash.replace(/^#\//, '');
        const [, providedKey = ''] = clean.split('/');
        if (adminAccessKey && providedKey !== adminAccessKey) {
          setView('LANDING');
          return;
        }
        setView('ADMIN_DASHBOARD');
      } else {
        setView('LANDING');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    const fetchMenu = async () => {
      const { data: cats } = await supabase.from('categories').select('*').eq('active', true).order('sort_order');
      const { data: prods } = await supabase.from('products').select('*').eq('active', true);
      const { data: addns } = await supabase.from('product_addons').select('*').eq('active', true);
      if (cats) setCategories(cats);
      if (prods) setProducts(prods);
      if (addns) setAddons(addns);
    };
    fetchMenu();
  }, []);

  useEffect(() => {
    if (!session) return;
    const fetchCart = async () => {
      const { data } = await supabase.from('cart_items').select('*, product:products(*), guest:session_guests(name)').eq('session_id', session.id);
      if (data) {
        setCart(data.map(item => {
          let parsed: any = {};
          let rawObservation = '';
          if (item.note) {
            try {
              parsed = JSON.parse(item.note);
            } catch {
              parsed = {};
              rawObservation = item.note;
            }
          }
          const observation = typeof parsed?.observation === 'string'
            ? parsed.observation
            : rawObservation;
          return {
            ...item,
            guest_name: (item as any).guest?.name,
            addon_ids: Array.isArray(parsed?.addon_ids) ? parsed.addon_ids : [],
            addon_names: Array.isArray(parsed?.addon_names) ? parsed.addon_names : [],
            addon_total_cents: Number(parsed?.addon_total_cents || 0),
            observation,
          } as CartItem;
        }));
      }
    };
    fetchCart();
    const channel = supabase.channel(`cart:${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items', filter: `session_id=eq.${session.id}` }, fetchCart)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  useEffect(() => {
    if (!session?.id) {
      setSessionOrders([]);
      return;
    }

    const fetchSessionOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false });

      if (data) {
        setSessionOrders(data as Order[]);
      }
    };

    fetchSessionOrders();

    const channel = supabase
      .channel(`session_orders:${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        async (payload) => {
          fetchSessionOrders();
          const row = (payload.new || payload.old || {}) as any;
          const oldRow = (payload.old || {}) as any;

          if (payload.eventType === 'INSERT' && row.created_by_guest_id !== guest?.id) {
            await pushLocalNotification('Mesa atualizada', 'Novo pedido enviado para esta mesa.', `order-insert-${session.id}`);
          }

          if (
            payload.eventType === 'UPDATE' &&
            row.approval_status === 'APPROVED' &&
            oldRow.approval_status !== 'APPROVED' &&
            row.created_by_guest_id === guest?.id &&
            guest?.id
          ) {
            const { error: cartError } = await supabase
              .from('cart_items')
              .delete()
              .eq('session_id', session.id)
              .eq('guest_id', guest.id);

            if (!cartError) {
              setShowCart(false);
            }
          }

          if (payload.eventType === 'UPDATE' && row.status === 'READY') {
            await pushLocalNotification('Pedido pronto', 'Um pedido da mesa foi marcado como pronto.', `order-ready-${session.id}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, guest?.id]);

  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`session_state:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        async (payload) => {
          const row = payload.new as Session;
          if (row.status === 'EXPIRED') {
            localStorage.removeItem(`guest_${session.id}`);
            setCart([]);
            setGuest(null);
            setSession(null);
            setActiveTable(null);
            setSessionOrders([]);
            setShowCart(false);
            await pushLocalNotification('Mesa finalizada', 'A mesa foi encerrada pelo atendimento.', `session-closed-${session.id}`);
            window.location.hash = '/';
          } else {
            setSession(row);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  const handleOpenTable = async (name: string) => {
    if (!activeTable) return;
    setIsLoading(true);
    let openSession: Session | null = session;

    if (!openSession || openSession.status !== 'OPEN') {
      const { data: sessionId, error: sessionError } = await supabase.rpc('get_or_create_open_session', { p_table_id: activeTable.id });
      if (sessionError || !sessionId) {
        setIsLoading(false);
        toast(sessionError?.message || 'Nao foi possivel abrir a mesa.', 'error');
        return;
      }

      const { data: loadedSession } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
      openSession = (loadedSession as Session) || null;
    }

    if (!openSession) {
      setIsLoading(false);
      toast('Nao foi possivel iniciar a sessao da mesa.', 'error');
      return;
    }

    const isFirstGuest = !openSession.host_guest_id;
    const { data: newGuest } = await supabase
      .from('session_guests')
      .insert({ session_id: openSession.id, name, is_host: isFirstGuest })
      .select()
      .single();

    if (newGuest) {
      if (isFirstGuest) {
        await supabase.from('sessions').update({ host_guest_id: newGuest.id }).eq('id', openSession.id);
      }

      const { data: refreshedSession } = await supabase.from('sessions').select('*').eq('id', openSession.id).maybeSingle();
      if (refreshedSession) {
        setSession(refreshedSession as Session);
      } else {
        setSession(openSession);
      }
      setGuest(newGuest);
      localStorage.setItem(`guest_${openSession.id}`, JSON.stringify(newGuest));
    }

    setIsLoading(false);
  };

  const handleUpdateCart = async (productId: string, delta: number) => {
    if (!session || !guest) return;
    if (hasOwnPendingApproval) return;
    const existing = cart.find(i => i.product_id === productId && i.guest_id === guest.id && !i.note);
    if (existing) {
      const newQty = existing.qty + delta;
      if (newQty <= 0) await supabase.from('cart_items').delete().eq('id', existing.id);
      else await supabase.from('cart_items').update({ qty: newQty }).eq('id', existing.id);
    } else if (delta > 0) {
      await supabase.from('cart_items').insert({ session_id: session.id, guest_id: guest.id, product_id: productId, qty: delta });
    }
  };

  const getProductAddons = (productId: string) => addons.filter(a => a.product_id === productId);

  const openAddonSelector = (product: Product) => {
    if (hasOwnPendingApproval) return;
    setPendingProduct(product);
    setSelectedAddonIds([]);
    setProductObservation('');
    setShowAddonSelector(true);
  };

  const toggleAddon = (product: Product, addonId: string) => {
    const mode = product.addon_selection_mode || 'MULTIPLE';
    if (mode === 'SINGLE') {
      setSelectedAddonIds((prev) => (prev[0] === addonId ? [] : [addonId]));
      return;
    }
    setSelectedAddonIds((prev) => prev.includes(addonId) ? prev.filter(id => id !== addonId) : [...prev, addonId]);
  };

  const getCartItemUnitPrice = (item: CartItem) => (item.product?.price_cents || 0) + (item.addon_total_cents || 0);

  const myCartItems = useMemo(
    () => cart.filter((item) => item.guest_id === guest?.id),
    [cart, guest?.id]
  );

  const pendingApprovalOrders = useMemo(
    () => sessionOrders.filter((order) => order.approval_status === 'PENDING_APPROVAL'),
    [sessionOrders]
  );

  const hasOwnPendingApproval = useMemo(
    () =>
      sessionOrders.some(
        (order) =>
          order.approval_status === 'PENDING_APPROVAL' &&
          order.created_by_guest_id === guest?.id
      ),
    [sessionOrders, guest?.id]
  );

  const myCartTotal = useMemo(
    () => myCartItems.reduce((acc, item) => acc + getCartItemUnitPrice(item) * item.qty, 0),
    [myCartItems]
  );

  const handleApprovePendingOrder = async (order: Order, approve: boolean) => {
    if (!guest?.is_host) return;

    const accepted = approve ? 'aceitar' : 'rejeitar';
    const ok = await confirm(`Deseja ${accepted} este pedido para a mesa?`);
    if (!ok) return;

    const payload = approve
      ? { approval_status: 'APPROVED', status: 'PENDING', approved_by_guest_id: guest.id, approved_at: new Date().toISOString() }
      : { approval_status: 'REJECTED', status: 'CANCELLED' };

    const { error } = await supabase.from('orders').update(payload).eq('id', order.id);
    if (error) {
      toast(`Erro ao atualizar aceite: ${error.message}`, 'error');
      return;
    }

    if (approve && order.created_by_guest_id) {
      const { error: cartError } = await supabase
        .from('cart_items')
        .delete()
        .eq('session_id', order.session_id)
        .eq('guest_id', order.created_by_guest_id);

      if (cartError) {
        toast(`Pedido aceito, mas houve erro ao limpar carrinho: ${cartError.message}`, 'error');
      }
    }

    toast(approve ? 'Pedido aceito e enviado para preparo.' : 'Pedido rejeitado.', approve ? 'success' : 'info');
  };

  const handleSendMyCart = async () => {
    if (!session || !guest) return;
    if (hasOwnPendingApproval) {
      toast('Voce ja possui um pedido aguardando aceite.', 'info');
      return;
    }
    if (myCartItems.length === 0) {
      toast('Seu carrinho esta vazio.', 'info');
      return;
    }

    setIsLoading(true);

    const approvalMode = (settings?.order_approval_mode || 'HOST') as 'HOST' | 'SELF';
    const requiresHostApproval = approvalMode === 'HOST' && !guest.is_host;
    const total = myCartItems.reduce((acc, item) => acc + getCartItemUnitPrice(item) * item.qty, 0);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        table_id: session.table_id,
        session_id: session.id,
        origin: 'CUSTOMER',
        status: 'PENDING',
        approval_status: requiresHostApproval ? 'PENDING_APPROVAL' : 'APPROVED',
        created_by_guest_id: guest.id,
        approved_by_guest_id: requiresHostApproval ? null : guest.id,
        approved_at: requiresHostApproval ? null : new Date().toISOString(),
        subtotal_cents: total,
        discount_mode: 'NONE',
        discount_value: 0,
        discount_cents: 0,
        service_type: 'ON_TABLE',
        delivery_fee_cents: 0,
        total_cents: total,
      })
      .select()
      .single();

    if (orderError || !order) {
      setIsLoading(false);
      toast(orderError?.message || 'Erro ao enviar pedido.', 'error');
      return;
    }

    const items = myCartItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      name_snapshot: item.product?.name || 'Item',
      unit_price_cents: getCartItemUnitPrice(item),
      qty: item.qty,
      note: (() => {
        const lines: string[] = [];
        if ((item.addon_names?.length || 0) > 0) {
          lines.push(`Adicionais: ${item.addon_names?.join(', ')}`);
        }
        const observation = (item.observation || '').trim();
        if (observation) {
          lines.push(`Observacao: ${observation}`);
        }
        return lines.length > 0 ? lines.join('\n') : null;
      })(),
      added_by_name: item.guest_name || guest.name,
      status: 'PENDING',
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(items);
    if (itemsError) {
      setIsLoading(false);
      toast(`Erro ao salvar itens: ${itemsError.message}`, 'error');
      return;
    }

    if (!requiresHostApproval) {
      await supabase.from('cart_items').delete().eq('session_id', session.id).eq('guest_id', guest.id);
    }
    setShowCart(false);
    setIsLoading(false);

    if (requiresHostApproval) {
      toast(`Seus itens foram enviados para a ${activeTable?.name}. Aguardando aceite do responsavel.`, 'info');
      await pushLocalNotification('Pedido enviado', 'Aguardando aceite do responsavel da mesa.', `pending-approval-${order.id}`);
    } else {
      toast('Pedido enviado para a cozinha.', 'success');
      await pushLocalNotification('Pedido confirmado', 'Seu pedido entrou na fila de preparo.', `approved-order-${order.id}`);
    }
  };

  const handleAddProductWithAddons = async (product: Product, addonIdsRaw: string[], observationRaw = '') => {
    if (!session || !guest) return;
    if (hasOwnPendingApproval) return;
    const addonIds = [...addonIdsRaw].sort();
    const selectedAddons = getProductAddons(product.id).filter(a => addonIds.includes(a.id));
    const addonTotal = selectedAddons.reduce((acc, a) => acc + a.price_cents, 0);
    const observation = observationRaw.trim();
    const payload = {
      addon_ids: addonIds,
      addon_names: selectedAddons.map(a => a.name),
      addon_total_cents: addonTotal,
      observation,
    };
    const note = addonIds.length > 0 || observation.length > 0 ? JSON.stringify(payload) : null;

    const existing = cart.find(i =>
      i.product_id === product.id &&
      i.guest_id === guest.id &&
      (i.note || null) === note
    );

    if (existing) {
      await supabase.from('cart_items').update({ qty: existing.qty + 1 }).eq('id', existing.id);
    } else {
      await supabase.from('cart_items').insert({
        session_id: session.id,
        guest_id: guest.id,
        product_id: product.id,
        qty: 1,
        note: note || null,
      });
    }
  };

  const handleResetPassword = async () => {
    const email = adminEmail.trim().toLowerCase();
    if (!email) {
      alert("Por favor, insira seu e-mail corporativo no campo acima antes de clicar em recuperar senha.");
      return;
    }
    
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/#' + adminHash,
    });
    setIsLoading(false);
    
    if (error) alert(error.message);
    else alert("E-mail de redefinição de senha enviado! Verifique sua caixa de entrada.");
  };

  if (view === 'LANDING') {
    return (
      <Layout settings={settings} wide>
        <div className="min-h-[85vh] p-6 lg:p-10 flex items-center justify-center">
          <section className="w-full max-w-2xl bg-white border border-gray-200 rounded-[28px] p-8 lg:p-12 text-center space-y-8 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
            <div className="w-20 h-20 mx-auto bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M21 7V5a2 2 0 0 0-2-2h-2" />
                <path d="M3 17v2a2 2 0 0 0 2 2h2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M8 8h3v3H8z" />
                <path d="M13 13h3v3h-3z" />
                <path d="M8 13h2" />
                <path d="M14 8h2" />
              </svg>
            </div>

            <div className="space-y-4">
              <h2 className="text-3xl lg:text-5xl font-black text-gray-900 uppercase tracking-tighter leading-none">
                Escaneie o QR Code
              </h2>
              <p className="text-sm lg:text-base text-gray-500 font-bold leading-relaxed max-w-xl mx-auto">
                Para acessar o cardapio e fazer pedidos, escaneie o QR Code impresso na mesa com a camera do seu celular.
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 lg:p-6 text-left space-y-2">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Como acessar</p>
              <p className="text-sm text-gray-700 font-semibold">1. Abra a camera do celular.</p>
              <p className="text-sm text-gray-700 font-semibold">2. Aponte para o QR Code da mesa.</p>
              <p className="text-sm text-gray-700 font-semibold">3. Toque no link para abrir o cardapio da mesa.</p>
            </div>

            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.18em]">
              O cardapio de pedidos e liberado somente apos o escaneamento.
            </p>
          </section>
        </div>
      </Layout>
    );
  }

  if (view === 'TEMP_REGISTER') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 lg:p-12">
        <div className="bg-white w-full max-w-[520px] rounded-[32px] border border-gray-200 p-8 lg:p-10 space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900 leading-none">Cadastro Temporario</h2>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.18em]">Teste de criacao no auth.users</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setTempRegisterStatus('');
              setIsLoading(true);

              const form = e.currentTarget;
              const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
              const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase();
              const password = (form.elements.namedItem('password') as HTMLInputElement).value;
              const role = (form.elements.namedItem('role') as HTMLSelectElement).value as UserRole;

              // Evita conflito de estado caso ja exista sessao ativa no navegador.
              await supabase.auth.signOut();

              const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { name } },
              });

              if (error) {
                const msg = error.message || '';
                if (msg.includes('users_email_partial_key') || msg.toLowerCase().includes('already registered')) {
                  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                  if (!signInError) {
                    setTempRegisterStatus(`Esse e-mail ja existe no auth.users (${email}) e a senha informada esta correta. Use o login normal.`);
                  } else {
                    setTempRegisterStatus(`Esse e-mail ja existe no auth.users (${email}). Se nao lembra a senha, use redefinicao de senha.`);
                  }
                } else {
                  setTempRegisterStatus(`Erro ao criar no auth.users (${email}): ${error.message}`);
                }
                setIsLoading(false);
                return;
              }

              const userId = data.user?.id;
              if (!userId) {
                setTempRegisterStatus('Usuario criado parcialmente. Verifique Auth > Users e confirme o e-mail.');
                setIsLoading(false);
                return;
              }

              const { error: profileError } = await supabase
                .from('profiles')
                .upsert({ id: userId, email, name, role }, { onConflict: 'id' });

              setIsLoading(false);
              if (profileError) {
                const profileMsg = profileError.message || '';
                if (profileMsg.toLowerCase().includes('row-level security')) {
                  setTempRegisterStatus('Usuario criado no auth.users. O profiles falhou por RLS; rode o SQL temporario para ajustar trigger/policies e depois faca login.');
                } else {
                  setTempRegisterStatus(`Criou no auth.users, mas falhou em public.profiles: ${profileError.message}`);
                }
              } else {
                setTempRegisterStatus('Cadastro concluido com sucesso em auth.users e public.profiles.');
                form.reset();
              }
            }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome</label>
              <input name="name" type="text" placeholder="Nome do usuario" required className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary transition-all font-bold placeholder:text-gray-300" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">E-mail</label>
              <input name="email" type="email" placeholder="usuario@empresa.com" required className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary transition-all font-bold placeholder:text-gray-300" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Senha</label>
              <input name="password" type="password" placeholder="Minimo 6 caracteres" minLength={6} required className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary transition-all font-bold placeholder:text-gray-300" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Perfil</label>
              <select name="role" defaultValue="WAITER" className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary transition-all font-bold">
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="WAITER">WAITER</option>
              </select>
            </div>

            <button
              disabled={isLoading}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-xl font-extrabold uppercase tracking-[0.14em] text-sm shadow-[0_8px_18px_rgba(15,23,42,0.22)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.28)] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Cadastrando...' : 'Criar Usuario'}
            </button>
          </form>

          {tempRegisterStatus && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-700">{tempRegisterStatus}</p>
            </div>
          )}

          <div className="text-center">
            <button onClick={() => (window.location.hash = adminHash)} className="text-[10px] text-gray-400 font-black uppercase tracking-widest hover:text-primary transition-colors">
              Voltar para Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'ADMIN_DASHBOARD') {
    if (!user) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 lg:p-12">
          <div className="bg-white w-full max-w-[440px] rounded-[32px] border border-gray-200 p-8 lg:p-12 space-y-10">
            <div className="text-center space-y-5">
              <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                {settings?.logo_url ? <img src={settings.logo_url} className="w-full h-full object-contain p-3" /> : <span className="text-primary font-black text-2xl">PL</span>}
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900 leading-none">Painel Interno</h2>
                <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">Gerenciamento Operacional</p>
              </div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsLoading(true);
              const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value;
              const password = (e.currentTarget.elements.namedItem('password') as HTMLInputElement).value;
              setAdminEmail(email);
              const { error } = await supabase.auth.signInWithPassword({ email, password });
              setIsLoading(false);
              if (error) alert(error.message);
            }} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">E-MAIL CORPORATIVO</label>
                <input
                  name="email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  required
                  className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary transition-all font-bold placeholder:text-gray-200"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">SENHA DE ACESSO</label>
                  <button type="button" onClick={handleResetPassword} className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline decoration-2">Esqueci a senha</button>
                </div>
                <input name="password" type="password" placeholder="********" required className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary transition-all font-bold placeholder:text-gray-200" />
              </div>
              <button
                disabled={isLoading}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-xl font-extrabold uppercase tracking-[0.14em] text-sm shadow-[0_8px_18px_rgba(15,23,42,0.22)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.28)] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Autenticando...' : 'Efetuar Login'}
              </button>
            </form>

            <div className="text-center">
              <button onClick={() => window.location.hash = '/'} className="text-[9px] text-gray-400 font-black uppercase tracking-widest hover:text-primary transition-colors">Voltar para o Cardapio</button>
              {tempRegisterEnabled && (
                <div className="mt-3">
                  <button onClick={() => window.location.hash = '/cadastro-temp'} className="text-[9px] text-gray-400 font-black uppercase tracking-widest hover:text-primary transition-colors">Cadastro Temporario</button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    const role = profile?.role || 'WAITER';
    const isWaiter = role === 'WAITER';
    const canAccessCounter = settings?.enable_counter_module !== false;
    const allowedTabs = getAllowedAdminTabs(role, canAccessCounter);

    const openTab = (tab: AdminTab) => {
      if (!allowedTabs.includes(tab)) return;
      setAdminTab(tab);
      if (!isDesktopAdmin) {
        setAdminSidebarOpen(false);
      }
    };

    const sidebarButtonClass = (tab: AdminTab) =>
      `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border ${
        adminTab === tab
          ? 'bg-primary text-white border-primary font-black'
          : 'text-gray-500 font-bold hover:bg-gray-50 border-transparent'
      }`;

    const sidebarContent = (
      <>
        <div className="space-y-10 flex-1">
          {isWaiter ? (
            <div className="px-2">
              <h3 className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Atendimento</h3>
              <nav className="space-y-1">
                <button onClick={() => openTab('WAITER_MODULE')} className={sidebarButtonClass('WAITER_MODULE')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18"/><path d="M6 7V4"/><path d="M18 7V4"/><path d="M8 11h8"/><path d="M12 11v9"/></svg>
                  Garcom
                </button>
              </nav>
            </div>
          ) : (
            <>
              <div className="px-2">
                <h3 className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Operacao</h3>
                <nav className="space-y-1">
                  <button onClick={() => openTab('ACTIVE_TABLES')} className={sidebarButtonClass('ACTIVE_TABLES')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Mesas Ativas
                  </button>
                  <button onClick={() => openTab('FINISHED_ORDERS')} className={sidebarButtonClass('FINISHED_ORDERS')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
                    Pedidos Finalizados
                  </button>
                  <button onClick={() => openTab('TABLES')} className={sidebarButtonClass('TABLES')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Mesas & QR
                  </button>
                  {allowedTabs.includes('COUNTER_MODULE') && (
                    <button onClick={() => openTab('COUNTER_MODULE')} className={sidebarButtonClass('COUNTER_MODULE')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8"/><path d="M12 18v2"/></svg>
                      Balcao
                    </button>
                  )}
                </nav>
              </div>

              <div className="px-2">
                <h3 className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Conteudo</h3>
                <nav className="space-y-1">
                  <button onClick={() => openTab('MENU')} className={sidebarButtonClass('MENU')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/></svg>
                    Cardapio
                  </button>
                  {allowedTabs.includes('SETTINGS') && (
                    <button onClick={() => openTab('SETTINGS')} className={sidebarButtonClass('SETTINGS')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      Configuracoes
                    </button>
                  )}
                  {allowedTabs.includes('STAFF') && (
                    <button onClick={() => openTab('STAFF')} className={sidebarButtonClass('STAFF')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      Equipe
                    </button>
                  )}
                </nav>
              </div>
            </>
          )}
        </div>

        <div className="pt-6 border-t border-gray-100 space-y-4">
          <div className="px-2 flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center font-black text-gray-400 uppercase text-[10px]">{profile?.name?.charAt(0)}</div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-gray-800 truncate max-w-[100px] leading-tight">{profile?.name}</span>
              <span className="text-[7px] font-black text-primary uppercase tracking-widest">{role}</span>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="w-full py-2.5 text-[8px] font-black text-red-400 uppercase tracking-widest hover:bg-red-50 rounded-lg transition-all">Sair</button>
        </div>
      </>
    );

    return (
      <Layout
        isAdmin
        settings={settings}
        leadingAction={
          <button
            onClick={() => setAdminSidebarOpen((prev) => !prev)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 border border-gray-200"
            title={adminSidebarOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'}
            aria-label={adminSidebarOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        }
      >
        <div className="flex min-h-[92vh] relative">
          <aside className={`hidden lg:flex flex-col shrink-0 border-r border-gray-200 bg-white overflow-hidden transition-all duration-300 ease-out ${adminSidebarOpen ? 'w-72 p-6' : 'w-0 p-0 border-r-0'}`}>
            {adminSidebarOpen && sidebarContent}
          </aside>

          <main className="flex-1 overflow-y-auto transition-all duration-300">
            <div className="p-4 sm:p-6 lg:p-8">
              {adminTab === 'ACTIVE_TABLES' && <AdminOrders mode="ACTIVE" />}
              {adminTab === 'FINISHED_ORDERS' && <AdminOrders mode="FINISHED" />}
              {adminTab === 'MENU' && <AdminMenu />}
              {adminTab === 'TABLES' && <AdminTables settings={settings} />}
              {adminTab === 'WAITER_MODULE' && <AdminWaiter profile={profile} settings={settings} />}
              {adminTab === 'COUNTER_MODULE' && <AdminCounter profile={profile} settings={settings} />}
              {adminTab === 'SETTINGS' && <AdminSettings settings={settings} onUpdate={fetchSettings} profile={profile} />}
              {adminTab === 'STAFF' && <AdminStaff profile={profile} />}
            </div>
          </main>

          <div className={`lg:hidden fixed inset-0 z-[95] ${adminSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div onClick={() => setAdminSidebarOpen(false)} className={`absolute inset-0 bg-gray-900/55 transition-opacity duration-300 ${adminSidebarOpen ? 'opacity-100' : 'opacity-0'}`} />
            <aside className={`absolute top-[73px] left-0 bottom-0 w-72 bg-white border-r border-gray-200 p-6 flex flex-col transition-transform duration-300 ease-out ${adminSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              {sidebarContent}
            </aside>
          </div>
        </div>
      </Layout>
    );
  }
  // Visualização Cliente (Mobile View)
  return (
    <Layout 
      settings={settings}
      title={activeTable?.name}
      actions={guest && <span className="bg-gray-50 text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest">{guest.name}</span>}
    >
      {!guest ? (
        <div className="p-8 flex flex-col items-center justify-center min-h-[70vh] space-y-12">
          <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-[22px] flex items-center justify-center text-primary">
             <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter leading-none italic">Sua Mesa Está Pronta</h2>
            <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-loose">Como deseja ser identificado(a) na {activeTable?.name}?</p>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault();
            const n = (e.currentTarget.elements.namedItem('un') as HTMLInputElement).value;
            handleOpenTable(n);
          }} className="w-full space-y-5">
            <input name="un" type="text" placeholder="Seu Nome" required className="w-full p-4.5 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-center font-black text-lg placeholder:text-gray-200" />
            <button className="w-full bg-primary text-white p-5 rounded-xl font-black uppercase tracking-widest text-base transition-transform active:scale-95">Abrir Cardápio</button>
          </form>
        </div>
      ) : (
        <div className="pb-32">
          <div className="sticky top-[69px] z-40 bg-white border-b border-gray-100 flex gap-2 overflow-x-auto p-3.5 no-scrollbar">
            <button onClick={() => setSelectedCategory(null)} className={`px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 border ${!selectedCategory ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>Todos</button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={`px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 border ${selectedCategory === c.id ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>{c.name}</button>
            ))}
          </div>

          <div className="p-4 space-y-8">
            {pendingApprovalOrders.length > 0 && (
              <section className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-amber-800 uppercase tracking-widest">Aguardando Aceite</h3>
                  <span className="text-[9px] text-amber-700 font-black uppercase tracking-widest">
                    {pendingApprovalOrders.length} pedido(s)
                  </span>
                </div>
                {pendingApprovalOrders.map((order) => (
                  <div key={order.id} className="bg-white border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-black text-gray-800">Pedido #{order.id.slice(0, 6)}</p>
                      <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-1">
                        {new Date(order.created_at).toLocaleTimeString()} | {formatCurrency(order.total_cents)}
                      </p>
                    </div>
                    {guest.is_host ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprovePendingOrder(order, true)}
                          className="px-3 py-2 rounded-lg bg-green-600 text-white text-[9px] font-black uppercase tracking-widest"
                        >
                          Aceitar
                        </button>
                        <button
                          onClick={() => handleApprovePendingOrder(order, false)}
                          className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[9px] font-black uppercase tracking-widest"
                        >
                          Rejeitar
                        </button>
                      </div>
                    ) : (
                      <p className="text-[9px] text-amber-700 font-black uppercase tracking-widest">Aguardando responsavel</p>
                    )}
                  </div>
                ))}
              </section>
            )}

            {hasOwnPendingApproval && (
              <section className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest">
                  Pedido pendente de aceite. Aguarde para editar ou enviar novamente.
                </p>
              </section>
            )}
            
            {categories.filter(c => !selectedCategory || c.id === selectedCategory).map(cat => (
              <div key={cat.id} className="space-y-6">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-black uppercase text-gray-800 tracking-tighter shrink-0 italic">{cat.name}</h3>
                  <div className="h-[1px] w-full bg-gray-100"></div>
                </div>
                <div className="grid gap-5">
                  {products.filter(p => p.category_id === cat.id).map(p => {
                    const inCartQty = cart.filter(i => i.product_id === p.id && i.guest_id === guest.id).reduce((acc, i) => acc + i.qty, 0);
                    const hasAddons = getProductAddons(p.id).length > 0;
                    return (
                      <div key={p.id} className="flex bg-white rounded-2xl p-3 gap-4 border border-gray-100 relative group transition-all">
                        {(p.image_url || '').trim() ? (
                          <img src={p.image_url} className="w-20 h-20 rounded-xl object-cover bg-gray-50 border border-gray-50" />
                        ) : (
                          <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                            <span className="text-[7px] font-black uppercase tracking-widest text-gray-300">Sem foto</span>
                          </div>
                        )}
                        <div className="flex-1 flex flex-col justify-between py-1">
                          <div>
                            <h4 className="font-black text-gray-900 text-base leading-none tracking-tighter">{p.name}</h4>
                            <p className="text-[8px] text-gray-400 mt-2 line-clamp-2 leading-relaxed font-black uppercase tracking-tight">{p.description}</p>
                          </div>
                          <div className="mt-2 space-y-2">
                            <span className="block font-black text-primary text-lg tracking-tighter">{formatCurrency(p.price_cents)}</span>
                            {session?.status === 'OPEN' && (
                              <div className="w-full">
                                {hasAddons ? (
                                  <div className="flex flex-col items-start gap-1.5">
                                    <button
                                      onClick={() => openAddonSelector(p)}
                                      disabled={hasOwnPendingApproval}
                                      className="bg-gray-900 text-white px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Adicionar
                                    </button>
                                    {inCartQty > 0 && <span className="text-[10px] font-black text-primary">{inCartQty} no carrinho</span>}
                                  </div>
                                ) : inCartQty > 0 ? (
                                  <div className="flex flex-col items-start gap-1.5">
                                    <div className="inline-flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg p-1 px-2.5">
                                      <button
                                        onClick={() => handleUpdateCart(p.id, -1)}
                                        disabled={hasOwnPendingApproval}
                                        className="text-lg font-black text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        -
                                      </button>
                                      <span className="text-xs font-black w-3 text-center text-gray-900">{inCartQty}</span>
                                      <button
                                        onClick={() => handleUpdateCart(p.id, 1)}
                                        disabled={hasOwnPendingApproval}
                                        className="text-lg font-black text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        +
                                      </button>
                                    </div>
                                    <button
                                      onClick={() => openAddonSelector(p)}
                                      disabled={hasOwnPendingApproval}
                                      className="text-[8px] font-black uppercase tracking-widest text-gray-500 underline disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      Adicionar com observacao
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-start gap-1.5">
                                    <button
                                      onClick={() => handleUpdateCart(p.id, 1)}
                                      disabled={hasOwnPendingApproval}
                                      className="bg-gray-900 text-white px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Adicionar
                                    </button>
                                    <button
                                      onClick={() => openAddonSelector(p)}
                                      disabled={hasOwnPendingApproval}
                                      className="text-[8px] font-black uppercase tracking-widest text-gray-500 underline disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      Adicionar com observacao
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {session?.status === 'OPEN' && myCartItems.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-gray-100 z-50">
              <button onClick={() => setShowCart(true)} className="w-full max-w-md mx-auto bg-gray-900 text-white p-4 rounded-xl flex justify-between items-center transition-transform active:scale-95">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-xs font-black text-white italic">
                    {myCartItems.reduce((a, b) => a + b.qty, 0)}
                  </div>
                  <div className="text-left">
                    <span className="block font-black text-[9px] uppercase tracking-[0.2em] leading-none mb-1 italic">Meu Carrinho</span>
                    <span className="text-[7px] text-gray-500 font-black uppercase tracking-widest">{myCartItems.length} item(ns) seus</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                   <span className="font-black text-primary text-lg tracking-tighter leading-none italic">{formatCurrency(myCartTotal)}</span>
                </div>
              </button>
            </div>
          )}

          {showAddonSelector && pendingProduct && (
            <div className="fixed inset-0 z-[90] bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-0 sm:p-6">
              <div className="bg-white w-full sm:max-w-2xl rounded-t-[28px] sm:rounded-[28px] max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-5 sm:p-6 flex flex-col gap-6 border-t sm:border border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900">{pendingProduct.name}</h3>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1">
                      {getProductAddons(pendingProduct.id).length === 0
                        ? 'Observacao opcional para este item'
                        : pendingProduct.addon_selection_mode === 'SINGLE'
                          ? 'Adicionais opcionais: escolha 1 ou nenhum'
                          : 'Adicionais opcionais: escolha quantos quiser ou nenhum'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAddonSelector(false);
                      setPendingProduct(null);
                      setSelectedAddonIds([]);
                      setProductObservation('');
                    }}
                    className="text-gray-400 font-black"
                  >
                    Fechar
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {getProductAddons(pendingProduct.id).length === 0 && (
                    <p className="text-sm text-gray-400 font-bold">Sem adicionais para este produto.</p>
                  )}
                  {getProductAddons(pendingProduct.id).map((addon) => {
                    const selected = selectedAddonIds.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        onClick={() => toggleAddon(pendingProduct, addon.id)}
                        className={`w-full flex items-center justify-between rounded-xl border p-3 ${selected ? 'border-primary bg-orange-50' : 'border-gray-200 bg-white'}`}
                      >
                        <span className="font-black text-sm text-gray-800">{addon.name}</span>
                        <span className="font-black text-sm text-primary">+ {formatCurrency(addon.price_cents)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="product-observation" className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Observacao (opcional)
                  </label>
                  <textarea
                    id="product-observation"
                    rows={3}
                    value={productObservation}
                    onChange={(e) => setProductObservation(e.target.value)}
                    placeholder="Ex.: sem cebola, molho separado..."
                    maxLength={180}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700 outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await handleAddProductWithAddons(pendingProduct, selectedAddonIds, productObservation);
                    setShowAddonSelector(false);
                    setPendingProduct(null);
                    setSelectedAddonIds([]);
                    setProductObservation('');
                  }}
                  className="w-full bg-gray-900 text-white py-4 rounded-xl font-black uppercase tracking-widest text-[11px]"
                >
                  {selectedAddonIds.length === 0 ? 'Adicionar sem adicional' : 'Adicionar ao Carrinho'}
                </button>
              </div>
            </div>
          )}

          {showCart && (
            <div className="fixed inset-0 z-[100] bg-gray-900/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-0 sm:p-6">
              <div className="bg-white w-full sm:max-w-3xl rounded-t-[32px] sm:rounded-[32px] max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-5 sm:p-8 flex flex-col gap-6 sm:gap-8 animate-in slide-in-from-bottom duration-300 border-t sm:border border-gray-100">
                <div className="flex justify-between items-center border-b border-gray-50 pb-5">
                   <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900 italic">Meu Carrinho</h3>
                    <p className="text-[8px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1.5 italic">Itens que voce vai enviar agora</p>
                   </div>
                  <button onClick={() => setShowCart(false)} className="bg-gray-50 p-3 rounded-lg text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
                <div className="flex flex-col gap-4">
                  {myCartItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                      <div className="flex gap-4 items-center">
                        <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center font-black text-primary text-sm italic">{item.qty}x</div>
                        <div className="flex flex-col">
                          <p className="font-black text-sm text-gray-800 tracking-tight leading-none">{item.product?.name}</p>
                          <p className="text-[8px] text-gray-400 uppercase font-black tracking-widest mt-1.5 flex items-center gap-1.5 italic opacity-70">
                             Por {item.guest_name}
                          </p>
                          {(item.addon_names?.length || 0) > 0 && (
                            <p className="text-[8px] text-primary uppercase font-black tracking-widest mt-1">
                              + {item.addon_names?.join(', ')}
                            </p>
                          )}
                          {!!(item.observation || '').trim() && (
                            <p className="text-[8px] text-gray-500 font-black tracking-wide mt-1">
                              Obs: {item.observation}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-black text-gray-900 text-base tracking-tighter italic">{formatCurrency(getCartItemUnitPrice(item) * item.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-6 border-t-2 border-gray-50 flex flex-col gap-6">
                  <div className="flex justify-between items-baseline font-black">
                    <span className="text-gray-400 text-[8px] uppercase tracking-[0.3em] font-black italic">Total do Meu Pedido</span>
                    <span className="text-primary text-3xl tracking-tighter italic">{formatCurrency(myCartTotal)}</span>
                  </div>
                  <button
                    onClick={handleSendMyCart}
                    disabled={isLoading || myCartItems.length === 0 || hasOwnPendingApproval}
                    className="w-full bg-primary text-white py-5 rounded-xl font-black text-base uppercase tracking-widest transition-transform active:scale-95 italic disabled:opacity-60"
                  >
                    {isLoading ? 'Enviando...' : hasOwnPendingApproval ? 'Aguardando Aceite' : 'Finalizar e Enviar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};

export default App;

