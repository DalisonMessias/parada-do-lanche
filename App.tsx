
import React, { Suspense, lazy, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { supabase, formatCurrency } from './services/supabase';
import { groupOrderItems } from './services/orderItemGrouping';
import { AppView, Table, Session, Guest, CartItem, Category, Product, ProductAddon, StoreSettings, Profile, UserRole, Order, Promotion } from './types';
import Layout from './components/Layout';
import { useFeedback } from './components/feedback/FeedbackProvider';
import CustomSelect from './components/ui/CustomSelect';
import AppModal from './components/ui/AppModal';
import CalculatorModal from './components/ui/CalculatorModal';
import { playOrderAlertSound } from './services/notifications';
import { applyPromotionToPrice, resolvePromotionForProduct } from './services/promotions';
import { printKitchenTicket } from './services/kitchenPrint';

const AdminOrders = lazy(() => import('./components/AdminOrders'));
const AdminTables = lazy(() => import('./components/AdminTables'));
const AdminMenu = lazy(() => import('./components/AdminMenu'));
const AdminSettings = lazy(() => import('./components/AdminSettings'));
const AdminStaff = lazy(() => import('./components/AdminStaff'));
const AdminWaiter = lazy(() => import('./components/AdminWaiter'));
const AdminCounter = lazy(() => import('./components/AdminCounter'));
const AdminPromotions = lazy(() => import('./components/AdminPromotions'));
const AdminRatings = lazy(() => import('./components/AdminRatings'));
const AdminPerformance = lazy(() => import('./components/AdminPerformance'));
const PublicReceipt = lazy(() => import('./components/PublicReceipt'));
const AdminPlan = lazy(() => import('./components/AdminPlan'));
const PublicPlanPayment = lazy(() => import('./components/PublicPlanPayment'));
const PublicDeliveryIntro = lazy(() => import('./components/PublicDeliveryIntro'));
const PublicDeliveryMenu = lazy(() => import('./components/PublicDeliveryMenu'));
const PublicDeliveryCheckout = lazy(() => import('./components/PublicDeliveryCheckout'));
const Maintenance = lazy(() => import('./components/Maintenance'));

type AdminTab =
  | 'ACTIVE_TABLES'
  | 'FINISHED_ORDERS'
  | 'PERFORMANCE'
  | 'TABLES'
  | 'MENU'
  | 'SETTINGS'
  | 'STAFF'
  | 'PROMOTIONS'
  | 'RATINGS'
  | 'WAITER_MODULE'
  | 'COUNTER_MODULE'
  | 'ADMIN_PLAN'
  | 'NOT_FOUND';

const PROMOTIONS_TAB_ID = '__PROMOTIONS__';
const UAITECH_LOGO_URL =
  'https://obeoiqjwqchwedeupngc.supabase.co/storage/v1/object/public/assets/logos/534545345.png';

const TAB_SLUGS: Record<AdminTab, string> = {
  ACTIVE_TABLES: 'pedidos',
  FINISHED_ORDERS: 'pedidos-finalizados',
  PERFORMANCE: 'desempenho',
  TABLES: 'mesas-e-qr',
  MENU: 'cardapio',
  SETTINGS: 'configuracoes',
  STAFF: 'equipe',
  PROMOTIONS: 'promocoes',
  RATINGS: 'avaliacoes',
  WAITER_MODULE: 'garcom',
  COUNTER_MODULE: 'balcao',
  ADMIN_PLAN: 'plano',
  NOT_FOUND: '404',
};

const SLUG_TO_TAB: Record<string, AdminTab> = Object.entries(TAB_SLUGS).reduce(
  (acc, [tab, slug]) => ({ ...acc, [slug]: tab as AdminTab }),
  {}
);

const lazyFallback = (
  <div className="bg-white border border-gray-200 rounded-2xl p-5">
    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Carregando...</p>
  </div>
);

const getAllowedAdminTabs = (
  role: UserRole,
  counterEnabled: boolean
): AdminTab[] => {
  if (role === 'WAITER') {
    return ['WAITER_MODULE'];
  }

  const tabs: AdminTab[] = ['ACTIVE_TABLES', 'FINISHED_ORDERS', 'PERFORMANCE', 'TABLES', 'MENU'];
  if (counterEnabled) tabs.push('COUNTER_MODULE');
  if (role === 'ADMIN') {
    tabs.push('SETTINGS');
    tabs.push('STAFF');
    tabs.push('PROMOTIONS');
    tabs.push('RATINGS');
    tabs.push('ADMIN_PLAN');
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
  const adminPath = adminAccessKey ? `/admin/${adminAccessKey}` : '/admin';
  const planPaymentRoute = '/V7B2X-QP9MW-L4N1R-Z6K0J-H3S5D';
  const [view, setView] = useState<AppView>('LANDING');
  const [publicReceiptToken, setPublicReceiptToken] = useState('');
  const [activeTable, setActiveTable] = useState<Table | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showAddonSelector, setShowAddonSelector] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingName, setRatingName] = useState('');
  const [sendingRating, setSendingRating] = useState(false);
  const [ratingSummary, setRatingSummary] = useState<{ average: number; count: number }>({
    average: 0,
    count: 0,
  });
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [productObservation, setProductObservation] = useState('');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [sessionOrders, setSessionOrders] = useState<Order[]>([]);
  const [tempRegisterStatus, setTempRegisterStatus] = useState('');
  const [tempRegisterRole, setTempRegisterRole] = useState<UserRole>('WAITER');
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
  const adminKnownOrderIdsRef = useRef<Set<string>>(new Set());
  const adminLatestOrderCreatedAtRef = useRef<string | null>(null);
  const adminOrdersSeededRef = useRef(false);
  const adminOrdersWatcherUserIdRef = useRef<string | null>(null);
  const adminAutoPrintedOrderIdsRef = useRef<Set<string>>(new Set());
  const adminAutoPrintInFlightOrderIdsRef = useRef<Set<string>>(new Set());
  const sessionResetRef = useRef<string | null>(null);
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

  const pushLocalNotification = useCallback(async (title: string, body: string, tag: string) => {
    const dedupeKey = `${tag}:${title}:${body}`;
    if (lastNotificationRef.current === dedupeKey) return;
    lastNotificationRef.current = dedupeKey;
    setTimeout(() => {
      if (lastNotificationRef.current === dedupeKey) lastNotificationRef.current = '';
    }, 1200);

    if (view === 'ADMIN_DASHBOARD') {
      await playOrderAlertSound({
        enabled: settings?.notification_sound_enabled,
        mp3Url: settings?.notification_sound_url,
      });
    } else {
      playLocalBeep();
    }
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
  }, [settings?.notification_sound_enabled, settings?.notification_sound_url, toast, view]);

  const forceCloseCustomerSession = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    if (sessionResetRef.current === sessionId) return;
    sessionResetRef.current = sessionId;

    localStorage.removeItem(`guest_${sessionId}`);
    setCart([]);
    setGuest(null);
    setSession(null);
    setActiveTable(null);
    setSessionOrders([]);
    setShowCart(false);
    await pushLocalNotification('Mesa finalizada', 'A mesa foi encerrada pelo atendimento.', `session-closed-${sessionId}`);
    window.history.pushState({}, '', '/');
  }, [pushLocalNotification]);

  const handleCustomerSessionExpired = useCallback(async (sessionId: string) => {
    await forceCloseCustomerSession(sessionId);
  }, [forceCloseCustomerSession]);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (settings.enable_delivery_module === true) return;
    if (view !== 'DELIVERY_INTRO' && view !== 'DELIVERY_MENU' && view !== 'DELIVERY_CHECKOUT') {
      return;
    }
    window.history.replaceState({}, '', '/');
    setView('LANDING');
  }, [settings?.enable_delivery_module, settings, view]);

  // Check Plan Status (Lazy Update)
  useEffect(() => {
    if (!settings) return;

    const checkPlanStatus = async () => {
      const status = settings.plan_status || 'PAID';
      const dueDateStr = settings.plan_current_due_date;
      if (!dueDateStr) return;

      const now = new Date();

      // Parse due date to local time set to 23:59:59
      const parts = dueDateStr.split('-');
      const dueDateEndOfDay = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
        23, 59, 59, 999
      );

      if (now > dueDateEndOfDay && (status === 'PAID' || status === 'OPEN')) {
        // Update to OVERDUE
        // We do this optimistically and silently
        await supabase.from('settings').update({ plan_status: 'OVERDUE' }).eq('id', 1);
        setSettings(prev => prev ? ({ ...prev, plan_status: 'OVERDUE' }) : null);
      } else if (now <= dueDateEndOfDay && status === 'OVERDUE') {
        // Auto-correct: If it's OVERDUE but we are still within the due day, revert to OPEN.
        // This fixes the issue where previous logic might have marked it prematurely.
        await supabase.from('settings').update({ plan_status: 'OPEN' }).eq('id', 1);
        setSettings(prev => prev ? ({ ...prev, plan_status: 'OPEN' }) : null);
      }
    };

    checkPlanStatus();
  }, [settings?.id, settings?.plan_current_due_date, settings?.plan_status]);

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
    if (view !== 'ADMIN_DASHBOARD' || !user || !profile || !settings) return;

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
    const handleRoute = async () => {
      try {
        const rawPath = window.location.pathname;
        const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
        console.log('Routing to:', path);

        if (path.startsWith('/cupom/')) {
          const token = decodeURIComponent((path.split('/cupom/')[1] || '').split(/[?#]/)[0] || '').trim();
          if (!token) {
            setPublicReceiptToken('');
            setView('LANDING');
            return;
          }
          setPublicReceiptToken(token);
          setView('PUBLIC_RECEIPT');
        } else if (path === '/menudigital/checkout') {
          setPublicReceiptToken('');
          setView('DELIVERY_CHECKOUT');
        } else if (path === '/menudigital/menu') {
          setPublicReceiptToken('');
          setView('DELIVERY_MENU');
        } else if (path === '/menudigital') {
          setPublicReceiptToken('');
          setView('DELIVERY_MENU');
        } else if (path === '/entrega/checkout') {
          window.history.replaceState({}, '', '/menudigital/checkout');
          setPublicReceiptToken('');
          setView('DELIVERY_CHECKOUT');
        } else if (path === '/entrega/menu') {
          window.history.replaceState({}, '', '/menudigital');
          setPublicReceiptToken('');
          setView('DELIVERY_MENU');
        } else if (path === '/entrega') {
          window.history.replaceState({}, '', '/menudigital');
          setPublicReceiptToken('');
          setView('DELIVERY_MENU');
        } else if (path.startsWith('/m/')) {
          setPublicReceiptToken('');
          const token = path.split('/m/')[1];
          console.log('Table token identified:', token);

          const { data: table, error: tableError } = await supabase.from('tables').select('*').eq('token', token).single();
          if (tableError) console.error('Error fetching table:', tableError);

          if (table) {
            setActiveTable(table);
            const { data: activeSession, error: sessionError } = await supabase.from('sessions').select('*').eq('table_id', table.id).eq('status', 'OPEN').maybeSingle();
            if (sessionError) console.error('Error fetching session:', sessionError);

            if (activeSession) {
              sessionResetRef.current = null;
              setSession(activeSession);
              const savedGuest = localStorage.getItem(`guest_${activeSession.id}`);
              if (savedGuest) {
                try {
                  setGuest(JSON.parse(savedGuest));
                } catch (e) {
                  console.error('Error parsing saved guest:', e);
                  localStorage.removeItem(`guest_${activeSession.id}`);
                  setGuest(null);
                }
              }
            } else {
              sessionResetRef.current = null;
              setSession(null);
              setGuest(null);
              setCart([]);
              setSessionOrders([]);
              setShowCart(false);
            }
            setView('CUSTOMER_MENU');
          } else {
            console.warn('Table not found for token:', token);
            setView('NOT_FOUND');
          }
        } else if (path === '/cadastro-temp') {
          setPublicReceiptToken('');
          setView(tempRegisterEnabled ? 'TEMP_REGISTER' : 'LANDING');
        } else if (path === planPaymentRoute) {
          setPublicReceiptToken('');
          setView('PUBLIC_PLAN_PAYMENT');
        } else if (path.startsWith('/admin')) {
          setPublicReceiptToken('');
          const clean = path.replace(/^\//, '');
          const segments = clean.split('/');
          let providedKey = segments[1] || '';
          let providedTabSlug = segments[2] || '';

          if (providedKey && (SLUG_TO_TAB[providedKey.toLowerCase()] || providedKey === 'plano')) {
            providedTabSlug = providedKey;
            providedKey = '';
          }

          if (adminAccessKey && providedKey !== adminAccessKey) {
            window.history.replaceState({}, '', '/');
            setView('LANDING');
            return;
          }

          if (providedTabSlug) {
            const tab = SLUG_TO_TAB[providedTabSlug.toLowerCase()];
            if (tab) {
              setAdminTab(tab);
            } else {
              setView('NOT_FOUND');
              return;
            }
          }

          setView('ADMIN_DASHBOARD');
        } else {
          setPublicReceiptToken('');
          if (path === '/' || path === '') {
            setView('LANDING');
          } else {
            setView('NOT_FOUND');
          }
        }
      } catch (err) {
        console.error('Critical routing error:', err);
        setView('NOT_FOUND');
      }
    };
    handleRoute();
    window.addEventListener('popstate', handleRoute);
    const originalPushState = window.history.pushState;
    window.history.pushState = function () {
      originalPushState.apply(this, arguments as any);
      handleRoute();
    };
    return () => {
      window.removeEventListener('popstate', handleRoute);
      window.history.pushState = originalPushState;
    };
  }, []);

  useEffect(() => {
    const fetchMenu = async () => {
      const { data: cats } = await supabase.from('categories').select('*').eq('active', true).order('sort_order');
      const { data: prods } = await supabase.from('products').select('*').eq('active', true);
      const { data: addns } = await supabase.from('product_addons').select('*').eq('active', true);
      const { data: promos } = await supabase
        .from('promotions')
        .select('*, promotion_products(product_id)')
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (cats) setCategories(cats);
      if (prods) setProducts(prods);
      if (addns) setAddons(addns);
      if (promos) setPromotions(promos as Promotion[]);
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
            base_price_cents: Number(parsed?.base_price_cents || 0),
            promo_name: parsed?.promo_name || null,
            promo_discount_type: parsed?.promo_discount_type || null,
            promo_discount_value: Number(parsed?.promo_discount_value || 0),
            promo_discount_cents: Number(parsed?.promo_discount_cents || 0),
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
            await handleCustomerSessionExpired(session.id);
          } else {
            sessionResetRef.current = null;
            setSession(row);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleCustomerSessionExpired, session?.id]);

  useEffect(() => {
    if (view !== 'CUSTOMER_MENU' || !session?.id) return;

    let active = true;

    const checkSessionStatus = async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('id', session.id)
        .maybeSingle();

      if (!active || error) return;
      if (!data || data.status === 'EXPIRED') {
        await handleCustomerSessionExpired(session.id);
      }
    };

    checkSessionStatus();

    const intervalId = window.setInterval(() => {
      checkSessionStatus();
    }, 5000);

    const handleFocus = () => {
      checkSessionStatus();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSessionStatus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleCustomerSessionExpired, session?.id, view]);

  useEffect(() => {
    if (view !== 'ADMIN_DASHBOARD' || !user?.id) return;

    if (adminOrdersWatcherUserIdRef.current !== user.id) {
      adminOrdersWatcherUserIdRef.current = user.id;
      adminKnownOrderIdsRef.current = new Set();
      adminLatestOrderCreatedAtRef.current = null;
      adminOrdersSeededRef.current = false;
      adminAutoPrintedOrderIdsRef.current = new Set();
      adminAutoPrintInFlightOrderIdsRef.current = new Set();
    }

    let active = true;

    const getOrderTypeLabel = (order: any) =>
      order?.service_type === 'ENTREGA'
        ? 'Entrega'
        : order?.service_type === 'RETIRADA'
          ? 'Retirada'
          : order?.origin === 'BALCAO'
            ? 'Balcao'
            : 'Mesa';

    const isAutoPrintableOrder = (order: any) =>
      order?.origin === 'WAITER' ||
      (order?.origin === 'CUSTOMER' && Boolean(order?.created_by_guest_id));

    const getTicketStatusLabel = (order: any) => {
      if (order?.approval_status === 'PENDING_APPROVAL') return 'Aguardando aceite';
      if (order?.approval_status === 'REJECTED') return 'Rejeitado';
      if (order?.status === 'PREPARING') return 'Em preparo';
      if (order?.status === 'READY') return 'Pronto';
      if (order?.status === 'FINISHED') return 'Finalizado';
      if (order?.status === 'CANCELLED') return 'Cancelado';
      return 'Confirmado';
    };

    const getAutoPrintWaiterFeeCents = (subtotalCents: number) => {
      if (settings?.enable_waiter_fee !== true) return 0;
      const mode = settings?.waiter_fee_mode === 'FIXED' ? 'FIXED' : 'PERCENT';
      const rawValue = Number(settings?.waiter_fee_value ?? (mode === 'PERCENT' ? 10 : 0));
      if (mode === 'FIXED') return Math.max(0, rawValue);
      const percent = Math.min(100, Math.max(0, rawValue));
      return Math.round(subtotalCents * (percent / 100));
    };

    const autoPrintMenuDigitalOrder = async (order: any) => {
      if (settings?.has_thermal_printer !== true) return;
      if (settings?.auto_print_menu_digital !== true) return;
      if (!isAutoPrintableOrder(order)) return;

      const orderId = String(order?.id || '').trim();
      if (!orderId) return;
      if (adminAutoPrintedOrderIdsRef.current.has(orderId)) return;
      if (adminAutoPrintInFlightOrderIdsRef.current.has(orderId)) return;

      adminAutoPrintInFlightOrderIdsRef.current.add(orderId);

      try {
        const { data: freshOrder, error: loadError } = await supabase
          .from('orders')
          .select('id,session_id,table_id,origin,service_type,created_by_guest_id,status,approval_status,created_at,customer_name,customer_phone,delivery_address,delivery_fee_cents,delivery_payment_method,delivery_cash_change_for_cents,subtotal_cents,total_cents,printed_at,items:order_items(*),session:sessions(created_at,closed_at,table:tables(name))')
          .eq('id', orderId)
          .maybeSingle();

        if (loadError || !freshOrder) {
          throw new Error(loadError?.message || 'pedido nao encontrado');
        }

        const loadedOrder = freshOrder as any;
        if (!isAutoPrintableOrder(loadedOrder)) return;
        if (loadedOrder.printed_at) {
          adminAutoPrintedOrderIdsRef.current.add(orderId);
          return;
        }

        const ticketType =
          loadedOrder?.service_type === 'ENTREGA'
            ? 'ENTREGA'
            : loadedOrder?.service_type === 'RETIRADA'
              ? 'RETIRADA'
              : loadedOrder?.origin === 'BALCAO'
                ? 'BALCAO'
                : 'MESA';
        const items = (loadedOrder.items || []) as any[];
        const fallbackSubtotal = items.reduce(
          (acc, item) => acc + (Number(item.qty || 0) * Number(item.unit_price_cents || 0)),
          0
        );
        const subtotalCents = Number(loadedOrder.subtotal_cents ?? fallbackSubtotal);
        const serviceFeeCents = ticketType === 'MESA' ? getAutoPrintWaiterFeeCents(subtotalCents) : 0;
        const deliveryFeeCents = Number(loadedOrder.delivery_fee_cents || 0);
        const totalCentsResolved =
          Number(loadedOrder.total_cents) ||
          Math.max(0, subtotalCents + serviceFeeCents + (ticketType === 'ENTREGA' ? deliveryFeeCents : 0));

        const openedAt = loadedOrder.created_at || loadedOrder.session?.created_at || null;
        const printResult = await printKitchenTicket({
          tickets: [
            {
              storeName: settings?.store_name || 'Loja',
              storeImageUrl: settings?.logo_url || null,
              orderId: loadedOrder.id,
              ticketType,
              openedAt,
              closedAt: loadedOrder.session?.closed_at || null,
              statusLabel: getTicketStatusLabel(loadedOrder),
              orderTime: openedAt
                ? new Date(openedAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                : '-',
              tableName: loadedOrder.session?.table?.name || 'Mesa',
              customerName: loadedOrder.customer_name || null,
              customerPhone: loadedOrder.customer_phone || null,
              deliveryAddress: loadedOrder.delivery_address || null,
              deliveryPaymentMethod: loadedOrder.delivery_payment_method || null,
              deliveryCashChangeForCents: Number(loadedOrder.delivery_cash_change_for_cents || 0),
              items: items.map((item: any) => ({
                name_snapshot: String(item.name_snapshot || 'Item'),
                qty: Number(item.qty || 0),
                unit_price_cents: Number(item.unit_price_cents || 0),
                note: item.note || '',
              })),
              subtotalCents,
              serviceFeeCents,
              deliveryFeeCents,
              totalCents: totalCentsResolved,
              receiptToken: null,
              receiptUrl: null,
            },
          ],
        });

        if (printResult.status !== 'printed') {
          if (printResult.status === 'cancelled') {
            console.warn('[AUTO_PRINT] Impressao automatica cancelada', {
              orderId,
              reason: printResult.message,
            });
            toast(`Impressao automatica cancelada: ${printResult.message}`, 'info');
            return;
          }

          console.error('[AUTO_PRINT] Falha na impressao automatica', {
            orderId,
            reason: printResult.message,
            printResult,
          });
          toast(
            `Falha ao imprimir automaticamente. Verifique a impressora. Motivo: ${printResult.message || 'erro desconhecido.'}`,
            'error'
          );
          return;
        }

        const { error: markError } = await supabase.rpc('mark_orders_printed', {
          p_session_id: loadedOrder.session_id,
          p_order_ids: [loadedOrder.id],
        });

        if (markError) {
          console.error('[AUTO_PRINT] Impresso, mas falhou ao marcar como impresso', {
            orderId,
            markError,
          });
          toast(`Impresso, mas falhou ao marcar automaticamente: ${markError.message}`, 'error');
          return;
        }

        adminAutoPrintedOrderIdsRef.current.add(orderId);
        toast('Pedido novo impresso automaticamente', 'success');
      } catch (error: any) {
        console.error('[AUTO_PRINT] Excecao no fluxo de impressao automatica', {
          orderId,
          error,
          message: error?.message,
        });
        toast(
          `Falha ao imprimir automaticamente. Verifique a impressora. Motivo: ${error?.message || 'erro inesperado.'}`,
          'error'
        );
      } finally {
        adminAutoPrintInFlightOrderIdsRef.current.delete(orderId);
      }
    };

    const registerOrderForAdmin = async (order: any, shouldNotify: boolean) => {
      const orderId = String(order?.id || '').trim();
      if (!orderId) return;
      if (adminKnownOrderIdsRef.current.has(orderId)) return;

      adminKnownOrderIdsRef.current.add(orderId);

      if (!shouldNotify) return;
      const shortId = orderId.slice(0, 6) || '----';
      await pushLocalNotification(
        'Novo pedido recebido',
        `${getOrderTypeLabel(order)} • Pedido #${shortId}`,
        `admin-new-order-${orderId}`
      );

      await autoPrintMenuDigitalOrder(order);
    };

    const seedAdminOrders = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,service_type,origin,created_at')
        .order('created_at', { ascending: false })
        .limit(80);

      if (!active || error) return;

      const sorted = [...(data || [])].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
      sorted.forEach((row: any) => {
        if (row?.id) adminKnownOrderIdsRef.current.add(String(row.id));
      });
      const latest = sorted[sorted.length - 1];
      adminLatestOrderCreatedAtRef.current = latest?.created_at || null;
      adminOrdersSeededRef.current = true;
    };

    const pollNewAdminOrders = async () => {
      if (!active) return;

      let query = supabase
        .from('orders')
        .select('id,service_type,origin,created_at')
        .order('created_at', { ascending: true })
        .limit(80);

      if (adminLatestOrderCreatedAtRef.current) {
        query = query.gt('created_at', adminLatestOrderCreatedAtRef.current);
      }

      const { data, error } = await query;
      if (!active || error || !data || data.length === 0) return;

      for (const row of data as any[]) {
        if (row?.created_at) {
          adminLatestOrderCreatedAtRef.current = row.created_at;
        }
        await registerOrderForAdmin(row, adminOrdersSeededRef.current);
      }
    };

    seedAdminOrders().then(() => {
      if (!active) return;
      pollNewAdminOrders();
    });

    const channel = supabase
      .channel(`admin_global_orders_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        const order = payload.new as any;
        if (order?.created_at) {
          adminLatestOrderCreatedAtRef.current = order.created_at;
        }
        await registerOrderForAdmin(order, adminOrdersSeededRef.current);
      })
      .subscribe();

    const intervalId = window.setInterval(() => {
      pollNewAdminOrders();
    }, 5000);

    const handleFocus = () => {
      pollNewAdminOrders();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollNewAdminOrders();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [
    settings?.auto_print_menu_digital,
    settings?.has_thermal_printer,
    settings?.enable_waiter_fee,
    settings?.logo_url,
    settings?.notification_sound_enabled,
    settings?.notification_sound_url,
    settings?.waiter_fee_mode,
    settings?.waiter_fee_value,
    toast,
    user?.id,
    view,
  ]);

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
      sessionResetRef.current = null;
      setGuest(newGuest);
      localStorage.setItem(`guest_${openSession.id}`, JSON.stringify(newGuest));
    }

    setIsLoading(false);
  };

  const handleUpdateCart = async (productId: string, delta: number) => {
    if (!session || !guest) return;
    if (hasOwnPendingApproval) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const pricing = getProductPricing(product);
    const notePayload = {
      addon_ids: [] as string[],
      addon_names: [] as string[],
      addon_total_cents: 0,
      base_price_cents: pricing.originalUnitPriceCents,
      promo_name: pricing.promoName,
      promo_discount_type: pricing.promoDiscountType,
      promo_discount_value: pricing.promoDiscountValue,
      promo_discount_cents: pricing.discountCents,
      observation: '',
    };
    const note = JSON.stringify(notePayload);
    const existing = cart.find(
      (item) => item.product_id === productId && item.guest_id === guest.id && (item.note || null) === note
    );
    if (existing) {
      const newQty = existing.qty + delta;
      if (newQty <= 0) await supabase.from('cart_items').delete().eq('id', existing.id);
      else await supabase.from('cart_items').update({ qty: newQty }).eq('id', existing.id);
    } else if (delta > 0) {
      await supabase
        .from('cart_items')
        .insert({ session_id: session.id, guest_id: guest.id, product_id: productId, qty: delta, note });
    }
  };

  const getProductAddons = (productId: string) => addons.filter(a => a.product_id === productId);
  const getProductPricing = (product: Product) => {
    const promotion = resolvePromotionForProduct(product.id, promotions);
    return applyPromotionToPrice(product.price_cents || 0, promotion);
  };
  const tableMenuProducts = useMemo(
    () => products.filter((product) => product.available_on_table !== false),
    [products]
  );

  const normalizedCustomerSearch = customerSearchTerm.trim().toLowerCase();
  const selectedCategoryId =
    selectedCategory && selectedCategory !== PROMOTIONS_TAB_ID ? selectedCategory : null;
  const showPromotionsOnly = selectedCategory === PROMOTIONS_TAB_ID;

  const filteredProductsBySearch = useMemo(() => {
    if (!normalizedCustomerSearch) return tableMenuProducts;
    return tableMenuProducts.filter((product) => {
      const categoryName =
        categories.find((category) => category.id === product.category_id)?.name || '';
      const searchableText = `${product.name} ${product.description || ''} ${categoryName}`.toLowerCase();
      return searchableText.includes(normalizedCustomerSearch);
    });
  }, [tableMenuProducts, categories, normalizedCustomerSearch]);

  const filteredProductIds = useMemo(
    () => new Set(filteredProductsBySearch.map((product) => product.id)),
    [filteredProductsBySearch]
  );

  const promotionProductIds = useMemo(() => {
    const ids = new Set<string>();
    tableMenuProducts.forEach((product) => {
      const pricing = getProductPricing(product);
      if (pricing.hasPromotion) ids.add(product.id);
    });
    return ids;
  }, [tableMenuProducts, promotions]);

  const featuredProducts = useMemo(() => {
    if (showPromotionsOnly || selectedCategoryId) return [] as Product[];
    return tableMenuProducts
      .filter((product) => Boolean(product.is_featured) && filteredProductIds.has(product.id))
      .filter((product) => !showPromotionsOnly || promotionProductIds.has(product.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [tableMenuProducts, filteredProductIds, showPromotionsOnly, selectedCategoryId, promotionProductIds]);

  const visibleMenuCategories = useMemo(() => {
    return categories.filter((category) => {
      if (selectedCategoryId && category.id !== selectedCategoryId) return false;
      const categoryProducts = tableMenuProducts.filter(
        (product) => product.category_id === category.id && filteredProductIds.has(product.id)
      );
      if (categoryProducts.length === 0) return false;
      if (showPromotionsOnly) {
        return categoryProducts.some((product) => promotionProductIds.has(product.id));
      }
      return true;
    });
  }, [categories, tableMenuProducts, filteredProductIds, selectedCategoryId, showPromotionsOnly, promotionProductIds]);

  const openAddonSelector = (product: Product) => {
    if (hasOwnPendingApproval) return;
    setPendingProduct(product);
    setSelectedAddonIds([]);
    setProductObservation('');
    setShowAddonSelector(true);
  };

  const closeAddonSelector = () => {
    setShowAddonSelector(false);
    setPendingProduct(null);
    setSelectedAddonIds([]);
    setProductObservation('');
  };

  const toggleAddon = (product: Product, addonId: string) => {
    const mode = product.addon_selection_mode || 'MULTIPLE';
    if (mode === 'SINGLE') {
      setSelectedAddonIds((prev) => (prev[0] === addonId ? [] : [addonId]));
      return;
    }
    setSelectedAddonIds((prev) => prev.includes(addonId) ? prev.filter(id => id !== addonId) : [...prev, addonId]);
  };

  const getCartItemUnitPrice = (item: CartItem) => {
    const basePrice = Number(item.base_price_cents || item.product?.price_cents || 0);
    const promoDiscount = Math.max(0, Number(item.promo_discount_cents || 0));
    const finalBase = Math.max(0, basePrice - promoDiscount);
    return finalBase + (item.addon_total_cents || 0);
  };

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
  const myCartPromotionDiscount = useMemo(
    () => myCartItems.reduce((acc, item) => acc + Math.max(0, Number(item.promo_discount_cents || 0)) * (item.qty || 0), 0),
    [myCartItems]
  );
  const waiterFeeEnabledForCustomer = settings?.enable_waiter_fee === true;
  const waiterFeeModeForCustomer = settings?.waiter_fee_mode === 'FIXED' ? 'FIXED' : 'PERCENT';
  const waiterFeeRawValueForCustomer = Number(
    settings?.waiter_fee_value ?? (waiterFeeModeForCustomer === 'PERCENT' ? 10 : 0)
  );
  const waiterFeePercentForCustomer = Math.min(100, Math.max(0, waiterFeeRawValueForCustomer));
  const waiterFeeFixedCentsForCustomer = Math.max(0, waiterFeeRawValueForCustomer);
  const estimatedMyWaiterFeeCents =
    waiterFeeEnabledForCustomer && waiterFeeModeForCustomer === 'PERCENT'
      ? Math.round(myCartTotal * (waiterFeePercentForCustomer / 100))
      : 0;
  const estimatedMyTotalWithWaiterFee = myCartTotal + estimatedMyWaiterFeeCents;

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
    const subtotalBeforePromotion = myCartItems.reduce((acc, item) => {
      const basePrice = Number(item.base_price_cents || item.product?.price_cents || 0);
      return acc + (basePrice + Number(item.addon_total_cents || 0)) * item.qty;
    }, 0);
    const promotionDiscountTotal = myCartItems.reduce(
      (acc, item) => acc + Math.max(0, Number(item.promo_discount_cents || 0)) * item.qty,
      0
    );
    const total = Math.max(0, subtotalBeforePromotion - promotionDiscountTotal);

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
        subtotal_cents: subtotalBeforePromotion,
        discount_mode: promotionDiscountTotal > 0 ? 'AMOUNT' : 'NONE',
        discount_value: promotionDiscountTotal,
        discount_cents: promotionDiscountTotal,
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

    const items = groupOrderItems(
      myCartItems.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        name_snapshot: item.product?.name || 'Item',
        original_unit_price_cents: Number(item.base_price_cents || item.product?.price_cents || 0),
        unit_price_cents: getCartItemUnitPrice(item),
        promo_name: item.promo_name || null,
        promo_discount_type: item.promo_discount_type || null,
        promo_discount_value: Number(item.promo_discount_value || 0),
        promo_discount_cents: Number(item.promo_discount_cents || 0),
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
      }))
    );

    const { error: itemsError } = await supabase.from('order_items').insert(items);
    if (itemsError) {
      setIsLoading(false);
      toast(`Erro ao salvar itens: ${itemsError.message}`, 'error');
      return;
    }

    const { error: clearCartError } = await supabase
      .from('cart_items')
      .delete()
      .eq('session_id', session.id)
      .eq('guest_id', guest.id);

    if (clearCartError) {
      toast(`Pedido enviado, mas houve erro ao limpar carrinho: ${clearCartError.message}`, 'error');
    } else {
      setCart((prev) =>
        prev.filter((item) => !(item.session_id === session.id && item.guest_id === guest.id))
      );
    }
    setShowCart(false);
    setIsLoading(false);

    if (requiresHostApproval) {
      toast(`Seus itens foram enviados para a ${activeTable?.name}. Aguardando aceite do responsavel da mesa.`, 'info');
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
    const pricing = getProductPricing(product);
    const observation = observationRaw.trim();
    const payload = {
      addon_ids: addonIds,
      addon_names: selectedAddons.map(a => a.name),
      addon_total_cents: addonTotal,
      base_price_cents: pricing.originalUnitPriceCents,
      promo_name: pricing.promoName,
      promo_discount_type: pricing.promoDiscountType,
      promo_discount_value: pricing.promoDiscountValue,
      promo_discount_cents: pricing.discountCents,
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
      toast('Por favor, insira seu e-mail corporativo antes de recuperar a senha.', 'info');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + adminPath,
    });
    setIsLoading(false);

    if (error) toast(error.message, 'error');
    else toast('E-mail de redefinicao de senha enviado. Verifique sua caixa de entrada.', 'success');
  };

  const getFeedbackDeviceToken = () => {
    const key = 'feedback_device_token';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const generated =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`) || '';
    localStorage.setItem(key, generated);
    return generated;
  };

  const sanitizeFeedbackText = (value: string, maxLength = 400) =>
    (value || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);

  const fetchStoreRatingSummary = useCallback(async () => {
    const { data, error } = await supabase.from('store_feedback').select('stars');
    if (error || !data) return;

    const stars = data
      .map((row: any) => Number(row?.stars || 0))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);

    const count = stars.length;
    const average = count > 0 ? stars.reduce((acc, value) => acc + value, 0) / count : 0;
    setRatingSummary({ average, count });
  }, []);

  useEffect(() => {
    if (view !== 'CUSTOMER_MENU') return;

    fetchStoreRatingSummary();
    const channel = supabase
      .channel('store_feedback_summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_feedback' }, () => {
        fetchStoreRatingSummary();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [view, fetchStoreRatingSummary]);

  const handleSubmitFeedback = async () => {
    if (!activeTable || !session) return;
    if (ratingStars < 1 || ratingStars > 5) {
      toast('Selecione de 1 a 5 estrelas.', 'error');
      return;
    }

    const now = Date.now();
    const lastSentAt = Number(localStorage.getItem('feedback_last_sent_at') || 0);
    if (lastSentAt && now - lastSentAt < 3 * 60 * 1000) {
      toast('Aguarde alguns minutos antes de enviar outra avaliacao.', 'info');
      return;
    }

    setSendingRating(true);
    const { error } = await supabase.rpc('create_store_feedback', {
      p_stars: ratingStars,
      p_comment: sanitizeFeedbackText(ratingComment, 400) || null,
      p_customer_name: sanitizeFeedbackText(ratingName, 80) || null,
      p_table_id: activeTable.id,
      p_session_id: session.id,
      p_order_id: null,
      p_device_token: getFeedbackDeviceToken(),
    });
    setSendingRating(false);

    if (error) {
      toast(error.message || 'Falha ao enviar avaliacao.', 'error');
      return;
    }

    localStorage.setItem('feedback_last_sent_at', String(now));
    setShowRatingModal(false);
    setRatingStars(0);
    setRatingComment('');
    setRatingName('');
    fetchStoreRatingSummary();
    toast('Avaliacao enviada. Obrigado!', 'success');
  };

  if (view === 'PUBLIC_RECEIPT') {
    return (
      <Suspense fallback={lazyFallback}>
        <PublicReceipt
          token={publicReceiptToken}
          onBackHome={() => {
            if (window.history.length > 1) {
              window.history.back();
              return;
            }
            window.history.pushState({}, '', '/');
          }}
        />
      </Suspense>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Iniciando Sistema...</p>
        </div>
      </div>
    );
  }

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

            {settings.enable_delivery_module === true && (
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.18em]">
                Pedidos de entrega em /menudigital
              </p>
            )}
          </section>
        </div>
      </Layout>
    );
  }

  // BLOCKING & NEW VIEWS LOGIC
  const planStatus = settings?.plan_status || 'PAID';
  const isSuspended = planStatus === 'OVERDUE' || planStatus === 'SUSPENDED';

  if (view === 'PUBLIC_PLAN_PAYMENT') {
    return <PublicPlanPayment />;
  }



  // Blocking Logic
  if (isSuspended) {
    const isPublicView =
      view === 'CUSTOMER_MENU' ||
      view === 'LANDING' ||
      view === 'TEMP_REGISTER' ||
      view === 'PUBLIC_RECEIPT' ||
      view === 'DELIVERY_INTRO' ||
      view === 'DELIVERY_MENU' ||
      view === 'DELIVERY_CHECKOUT';
    if (isPublicView) {
      return <Maintenance />;
    }

    if (view === 'ADMIN_DASHBOARD') {
      // Enforce Plan View for Admin Dashboard if suspended
      return (
        <Layout isAdmin settings={settings} showFooter={false}>
          <Suspense fallback={lazyFallback}>
            <AdminPlan />
          </Suspense>
        </Layout>
      );
    }
  }

  if (view === 'DELIVERY_INTRO') {
    return (
      <Layout settings={settings} wide>
        <Suspense fallback={lazyFallback}>
          <PublicDeliveryIntro />
        </Suspense>
      </Layout>
    );
  }

  if (view === 'DELIVERY_MENU') {
    return (
      <Layout settings={settings} wide>
        <Suspense fallback={lazyFallback}>
          <PublicDeliveryMenu />
        </Suspense>
      </Layout>
    );
  }

  if (view === 'DELIVERY_CHECKOUT') {
    return (
      <Layout settings={settings} wide>
        <Suspense fallback={lazyFallback}>
          <PublicDeliveryCheckout settings={settings} />
        </Suspense>
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
              const role = (form.elements.namedItem('role') as HTMLInputElement).value as UserRole;

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
                setTempRegisterRole('WAITER');
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
              <CustomSelect
                name="role"
                value={tempRegisterRole}
                onChange={(nextValue) => setTempRegisterRole(nextValue as UserRole)}
                options={[
                  { value: 'ADMIN', label: 'ADMIN' },
                  { value: 'MANAGER', label: 'MANAGER' },
                  { value: 'WAITER', label: 'WAITER' },
                ]}
                buttonClassName="p-4 font-bold text-sm"
              />
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
            <button onClick={() => window.history.pushState({}, '', adminPath)} className="text-[10px] text-gray-400 font-black uppercase tracking-widest hover:text-primary transition-colors">Voltar para Login</button>
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
              if (error) toast(error.message, 'error');
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
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="********"
                    required
                    className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary transition-all font-bold placeholder:text-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88s.5-5.38 5.62-5.38C20.62 4.5 22 9.24 22 12c0 2.22-1.21 4.22-3.23 5.34" /><path d="M2 2l20 20" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="M13 13L13 13" /><circle cx="12" cy="12" r="3" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>
              <button
                disabled={isLoading}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-xl font-extrabold uppercase tracking-[0.14em] text-sm shadow-[0_8px_18px_rgba(15,23,42,0.22)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.28)] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Autenticando...' : 'Efetuar Login'}
              </button>
            </form>

            <div className="text-center">
              <button onClick={() => window.history.pushState({}, '', '/')} className="text-[9px] text-gray-400 font-black uppercase tracking-widest hover:text-primary transition-colors">Voltar para o Cardapio</button>
              {tempRegisterEnabled && (
                <div className="mt-3">
                  <button onClick={() => window.history.pushState({}, '', '/cadastro-temp')} className="text-[9px] text-gray-400 font-black uppercase tracking-widest hover:text-primary transition-colors">Cadastro Temporario</button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (view === 'ADMIN_DASHBOARD' || (adminTab === 'ADMIN_PLAN' && view !== 'PUBLIC_PLAN_PAYMENT')) {
      const role = profile?.role || 'WAITER';
      const isWaiter = role === 'WAITER';
      const canAccessCounter = settings?.enable_counter_module !== false;
      const allowedTabs = getAllowedAdminTabs(role, canAccessCounter);

      const openTab = (tab: AdminTab) => {
        if (!allowedTabs.includes(tab)) return;

        const path = window.location.pathname;
        const clean = path.replace(/^\//, '');
        const segments = clean.split('/');
        let providedKey = segments[1] || adminAccessKey || '';

        // If the found key is actually a slug, ignore it as a key
        if (providedKey && (Object.values(TAB_SLUGS).includes(providedKey) || providedKey === 'plano')) {
          providedKey = adminAccessKey || '';
        }

        const slug = TAB_SLUGS[tab];

        const newPath = providedKey ? `/admin/${providedKey}/${slug}` : `/admin/${slug}`;
        window.history.pushState({}, '', newPath);

        setAdminTab(tab);
        if (!isDesktopAdmin) {
          setAdminSidebarOpen(false);
        }
      };

      const sidebarButtonClass = (tab: AdminTab) =>
        `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border ${adminTab === tab
          ? 'bg-primary text-white border-primary font-black'
          : 'text-gray-500 font-bold hover:bg-gray-50 border-transparent'
        }`;

      const sidebarContent = (
        <>
          <div className="space-y-10 flex-1 min-h-0 overflow-y-auto pr-1">
            {isWaiter ? (
              <div className="px-2">
                <h3 className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Atendimento</h3>
                <nav className="space-y-1">
                  <button onClick={() => openTab('WAITER_MODULE')} className={sidebarButtonClass('WAITER_MODULE')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18" /><path d="M6 7V4" /><path d="M18 7V4" /><path d="M8 11h8" /><path d="M12 11v9" /></svg>
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      Pedidos
                    </button>
                    <button onClick={() => openTab('FINISHED_ORDERS')} className={sidebarButtonClass('FINISHED_ORDERS')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
                      Pedidos Finaliz...
                    </button>
                    <button onClick={() => openTab('PERFORMANCE')} className={sidebarButtonClass('PERFORMANCE')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="3" x2="3" y2="21" /><line x1="21" y1="21" x2="3" y2="21" /><path d="m7 14 4-4 3 3 5-6" /></svg>
                      Desempenho
                    </button>
                    <button onClick={() => openTab('TABLES')} className={sidebarButtonClass('TABLES')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                      Mesas & QR
                    </button>
                    {allowedTabs.includes('COUNTER_MODULE') && (
                      <button onClick={() => openTab('COUNTER_MODULE')} className={sidebarButtonClass('COUNTER_MODULE')}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 20h8" /><path d="M12 18v2" /></svg>
                        Balcao
                      </button>
                    )}
                  </nav>
                </div>

                <div className="px-2">
                  <h3 className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Conteudo</h3>
                  <nav className="space-y-1">
                    <button onClick={() => openTab('MENU')} className={sidebarButtonClass('MENU')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="2" y1="14" x2="6" y2="14" /><line x1="10" y1="8" x2="14" y2="8" /><line x1="18" y1="16" x2="22" y2="16" /></svg>
                      Cardapio
                    </button>
                    {allowedTabs.includes('SETTINGS') && (
                      <button onClick={() => openTab('SETTINGS')} className={sidebarButtonClass('SETTINGS')}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                        Configuracoes
                      </button>
                    )}
                    {allowedTabs.includes('STAFF') && (
                      <button onClick={() => openTab('STAFF')} className={sidebarButtonClass('STAFF')}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        Equipe
                      </button>
                    )}
                    {allowedTabs.includes('ADMIN_PLAN') && (
                      <button onClick={() => openTab('ADMIN_PLAN')} className={sidebarButtonClass('ADMIN_PLAN')}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                        Meu Plano
                      </button>
                    )}
                    {allowedTabs.includes('PROMOTIONS') && (
                      <button onClick={() => openTab('PROMOTIONS')} className={sidebarButtonClass('PROMOTIONS')}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3.83a2 2 0 0 0-2.83 0L3 9a2 2 0 0 0 0 2.83l9.59 9.58a2 2 0 0 0 2.82 0L21 15.83a2 2 0 0 0 0-2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                        Promocoes
                      </button>
                    )}
                    {allowedTabs.includes('RATINGS') && (
                      <button onClick={() => openTab('RATINGS')} className={sidebarButtonClass('RATINGS')}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                        Avaliacoes
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
          showFooter={false}
          leadingAction={
            <button
              onClick={() => setAdminSidebarOpen((prev) => !prev)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 border border-gray-200"
              title={adminSidebarOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'}
              aria-label={adminSidebarOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
          }
          actions={
            <button
              type="button"
              onClick={() => setShowCalculator(true)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-[9px] font-black uppercase tracking-widest"
            >
              Calculadora
            </button>
          }
        >
          <div className="flex h-[calc(100vh-73px)] relative overflow-hidden">
            <aside className={`hidden lg:flex flex-col shrink-0 h-full min-h-0 border-r border-gray-200 bg-white overflow-hidden transition-all duration-300 ease-out ${adminSidebarOpen ? 'w-72 p-6' : 'w-0 p-0 border-r-0'}`}>
              {adminSidebarOpen && sidebarContent}
            </aside>

            <main className="flex-1 h-full min-h-0 overflow-y-auto transition-all duration-300">
              <div className="p-4 sm:p-6 lg:p-8">
                <Suspense fallback={lazyFallback}>
                  {adminTab === 'ACTIVE_TABLES' && <AdminOrders mode="ACTIVE" settings={settings} profile={profile} />}
                  {adminTab === 'FINISHED_ORDERS' && <AdminOrders mode="FINISHED" settings={settings} profile={profile} />}
                  {adminTab === 'PERFORMANCE' && <AdminPerformance profile={profile} />}
                  {adminTab === 'MENU' && <AdminMenu />}
                  {adminTab === 'TABLES' && <AdminTables settings={settings} />}
                  {adminTab === 'WAITER_MODULE' && <AdminWaiter profile={profile} />}
                  {adminTab === 'COUNTER_MODULE' && <AdminCounter profile={profile} settings={settings} />}
                  {adminTab === 'SETTINGS' && <AdminSettings settings={settings} onUpdate={fetchSettings} profile={profile} />}
                  {adminTab === 'STAFF' && <AdminStaff profile={profile} />}
                  {adminTab === 'PROMOTIONS' && <AdminPromotions />}
                  {adminTab === 'RATINGS' && <AdminRatings />}
                  {adminTab === 'ADMIN_PLAN' && <AdminPlan />}
                </Suspense>

                <footer className="mt-8 border-t border-gray-200 pt-4 text-center">
                  <img src={UAITECH_LOGO_URL} alt="Logo da loja" className="h-5 w-auto mx-auto" />
                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
                    © {new Date().getFullYear()}
                  </p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-500">
                    Dalison Messias
                  </p>
                </footer>
              </div>
            </main>

            <div className={`lg:hidden fixed top-[73px] left-0 right-0 bottom-0 z-[120] ${adminSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
              <div onClick={() => setAdminSidebarOpen(false)} className={`absolute inset-0 bg-gray-900/55 transition-opacity duration-300 ${adminSidebarOpen ? 'opacity-100' : 'opacity-0'}`} />
              <aside className={`absolute top-0 left-0 bottom-0 w-72 bg-white border-r border-gray-200 p-6 flex flex-col transition-transform duration-300 ease-out ${adminSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {sidebarContent}
              </aside>
            </div>
          </div>
          <CalculatorModal open={showCalculator} onClose={() => setShowCalculator(false)} title="Calculadora" />
        </Layout>
      );
    }

    // NOT_FOUND View
    if (view === 'NOT_FOUND') {
      return (
        <Layout isAdmin={false} settings={settings} showFooter={false} wide>
          <div className="min-h-[85vh] p-6 lg:p-10 flex items-center justify-center">
            <section className="w-full bg-white border border-gray-200 rounded-[28px] p-8 lg:p-12 text-center space-y-8 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
              <div className="w-20 h-20 lg:w-24 lg:h-24 mx-auto bg-red-50 border border-red-100 rounded-2xl lg:rounded-3xl flex items-center justify-center text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <div className="space-y-4">
                <h1 className="text-4xl lg:text-6xl font-black text-gray-900 uppercase tracking-tighter leading-none">404</h1>
                <p className="text-sm lg:text-base text-gray-500 font-bold leading-relaxed max-w-xl mx-auto">
                  Ops! A pagina que voce esta procurando nao foi encontrada ou foi movida.
                </p>
              </div>

              <button
                onClick={() => {
                  // Prioridade 1: Se está logado como admin, volta para o painel
                  if (user) {
                    const path = window.location.pathname;
                    if (path.startsWith('/admin')) {
                      // Já está em admin, volta para a raiz do admin
                      const segments = path.replace(/^\//, '').split('/');
                      const providedKey = segments[1] || '';
                      if (adminAccessKey && providedKey === adminAccessKey) {
                        window.history.pushState({}, '', `/admin/${adminAccessKey}`);
                      } else {
                        window.history.pushState({}, '', '/admin');
                      }
                    } else {
                      window.history.pushState({}, '', '/admin');
                    }
                  }
                  // Prioridade 2: Se tem mesa e sessão ativa, volta para o cardápio da mesa
                  else if (activeTable?.token && session) {
                    window.history.pushState({}, '', `/m/${activeTable.token}`);
                  }
                  // Prioridade 3: Senão, vai para a página inicial
                  else {
                    window.history.pushState({}, '', '/');
                  }
                }}
                className="px-8 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs lg:text-sm shadow-[0_8px_18px_rgba(15,23,42,0.22)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.28)] transition-all active:scale-[0.99]"
              >
                Voltar {user ? 'ao Painel' : (activeTable && session ? 'ao Cardapio' : 'ao Inicio')}
              </button>

              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.18em]">
                Se voce acredita que isto e um erro, entre em contato com o suporte.
              </p>
            </section>
          </div>
        </Layout>
      );
    }

    // Visualizacao Cliente (Mobile View)
    return (
      <Layout
        settings={settings}
        title={activeTable?.name}
        actions={
          guest && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRatingModal(true)}
                className="p-2 rounded-lg border border-gray-200 bg-white text-amber-500"
                aria-label="Avaliar loja"
                title="Avaliar loja"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m12 2 3.09 6.26L22 9.27l-5 4.88 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.88 6.91-1.01z" />
                </svg>
              </button>
              <div className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-right leading-tight min-w-[74px]">
                <p className="text-[9px] font-black text-amber-500">
                  {ratingSummary.count > 0 ? ratingSummary.average.toFixed(1).replace('.', ',') : '--'} ★
                </p>
                <p className="text-[7px] font-black uppercase tracking-widest text-gray-400">
                  {ratingSummary.count} aval.
                </p>
              </div>
              <span className="bg-gray-50 text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest max-w-[82px] truncate">
                {(guest.name || '').split(' ')[0] || guest.name}
              </span>
            </div>
          )
        }
      >
        {!guest ? (
          <div className="p-8 flex flex-col items-center justify-center min-h-[70vh] space-y-12">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-[22px] flex items-center justify-center text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div className="text-center space-y-3">
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter leading-none italic">Sua Mesa Esta Pronta</h2>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-loose">Como deseja ser identificado(a) na {activeTable?.name}?</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const n = (e.currentTarget.elements.namedItem('un') as HTMLInputElement).value;
              handleOpenTable(n);
            }} className="w-full space-y-5">
              <input name="un" type="text" placeholder="Seu Nome" required className="w-full p-4.5 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary text-center font-black text-lg placeholder:text-gray-200" />
              <button className="w-full bg-primary text-white p-5 rounded-xl font-black uppercase tracking-widest text-base transition-transform active:scale-95">Abrir Cardapio</button>
            </form>
          </div>
        ) : (
          <div className="pb-32">
            <div className="sticky top-[69px] z-40 bg-white border-b border-gray-100">
              <div className="p-3.5 space-y-3">
                <input
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  placeholder="Buscar produtos..."
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm font-bold outline-none focus:border-primary"
                />
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 border ${!selectedCategory ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-400 border-gray-100'
                      }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setSelectedCategory(PROMOTIONS_TAB_ID)}
                    className={`px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 border ${showPromotionsOnly ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-400 border-gray-100'
                      }`}
                  >
                    Promocoes
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.id)}
                      className={`px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 border ${selectedCategory === c.id ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-400 border-gray-100'
                        }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 space-y-8">
              {pendingApprovalOrders.length > 0 && (
                <section className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-amber-800 uppercase tracking-widest">Aguardando Responsavel da Mesa</h3>
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
                        <p className="text-[9px] text-amber-700 font-black uppercase tracking-widest">Aguardando responsavel da mesa</p>
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

              {featuredProducts.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-black uppercase text-gray-800 tracking-tighter shrink-0 italic">Produtos em Destaque</h3>
                    <div className="h-[1px] w-full bg-gray-100"></div>
                  </div>
                  <div className="space-y-3">
                    {featuredProducts.map((p) => {
                      const inCartQty = cart.filter((i) => i.product_id === p.id && i.guest_id === guest.id).reduce((acc, i) => acc + i.qty, 0);
                      const hasAddons = getProductAddons(p.id).length > 0;
                      const pricing = getProductPricing(p);
                      const unitPrice = pricing.finalUnitPriceCents;
                      const hasPromotion = pricing.hasPromotion;
                      const promoBadge =
                        pricing.promoDiscountType === 'PERCENT'
                          ? `${pricing.promoDiscountValue}% OFF`
                          : `- ${formatCurrency(pricing.discountCents)}`;

                      return (
                        <div key={`featured-${p.id}`} className="bg-white rounded-2xl p-3 border border-primary/20 transition-all">
                          <div className="flex gap-3 items-start">
                            {(p.image_url || '').trim() ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImage({ url: p.image_url, name: p.name })}
                                className="shrink-0 rounded-xl overflow-hidden border border-gray-50 bg-gray-50"
                              >
                                <img src={p.image_url} className="w-20 h-20 rounded-xl object-cover shrink-0 cursor-zoom-in" />
                              </button>
                            ) : (
                              <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                                <span className="text-[7px] font-black uppercase tracking-widest text-gray-300">Sem foto</span>
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h4 className="font-black text-gray-900 text-base leading-none tracking-tighter truncate">{p.name}</h4>
                                  <p className="text-[10px] text-gray-500 mt-2 leading-relaxed font-bold line-clamp-2">{p.description}</p>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span className="px-2 py-1 rounded-full bg-primary/15 text-primary text-[9px] font-black uppercase tracking-widest mb-1">
                                    Destaque
                                  </span>
                                  {hasPromotion && (
                                    <span className="px-2 py-1 rounded-full bg-primary/15 text-primary text-[9px] font-black uppercase tracking-widest mb-1">
                                      Promocao • {promoBadge}
                                    </span>
                                  )}
                                  {hasPromotion && (
                                    <span className="text-[10px] font-black text-gray-400 line-through">{formatCurrency(p.price_cents)}</span>
                                  )}
                                  <span className="font-black text-primary text-lg tracking-tighter">{formatCurrency(unitPrice)}</span>
                                </div>
                              </div>

                              {session?.status === 'OPEN' && (
                                <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
                                  <div className="flex items-center gap-2">
                                    {!hasAddons && inCartQty > 0 && (
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
                                    )}
                                    {inCartQty > 0 && (
                                      <span className="text-[10px] font-black text-primary">{inCartQty} no carrinho</span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => (hasAddons ? openAddonSelector(p) : handleUpdateCart(p.id, 1))}
                                      disabled={hasOwnPendingApproval}
                                      className="bg-gray-900 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Adicionar
                                    </button>
                                    <button
                                      onClick={() => openAddonSelector(p)}
                                      disabled={hasOwnPendingApproval}
                                      className="text-[8px] font-black uppercase tracking-widest text-gray-500 underline disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      Obs/Adicional
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {visibleMenuCategories.map((cat) => {
                let categoryProducts = tableMenuProducts.filter(
                  (p) => p.category_id === cat.id && filteredProductIds.has(p.id)
                );
                if (showPromotionsOnly) {
                  categoryProducts = categoryProducts.filter((p) => promotionProductIds.has(p.id));
                }
                if (!showPromotionsOnly && !selectedCategoryId && featuredProducts.length > 0) {
                  categoryProducts = categoryProducts.filter((p) => !Boolean(p.is_featured));
                }

                if (categoryProducts.length === 0) return null;

                categoryProducts = [...categoryProducts].sort((a, b) => {
                  const featuredDiff = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
                  if (featuredDiff !== 0) return featuredDiff;
                  return (a.name || '').localeCompare(b.name || '', 'pt-BR');
                });

                return (
                  <div key={cat.id} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black uppercase text-gray-800 tracking-tighter shrink-0 italic">{cat.name}</h3>
                      <div className="h-[1px] w-full bg-gray-100"></div>
                    </div>
                    <div className="space-y-3">
                      {categoryProducts.map((p) => {
                        const inCartQty = cart.filter((i) => i.product_id === p.id && i.guest_id === guest.id).reduce((acc, i) => acc + i.qty, 0);
                        const hasAddons = getProductAddons(p.id).length > 0;
                        const pricing = getProductPricing(p);
                        const unitPrice = pricing.finalUnitPriceCents;
                        const hasPromotion = pricing.hasPromotion;
                        const promoBadge =
                          pricing.promoDiscountType === 'PERCENT'
                            ? `${pricing.promoDiscountValue}% OFF`
                            : `- ${formatCurrency(pricing.discountCents)}`;

                        return (
                          <div key={p.id} className="bg-white rounded-2xl p-3 border border-gray-100 transition-all">
                            <div className="flex gap-3 items-start">
                              {(p.image_url || '').trim() ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage({ url: p.image_url, name: p.name })}
                                  className="shrink-0 rounded-xl overflow-hidden border border-gray-50 bg-gray-50"
                                >
                                  <img src={p.image_url} className="w-20 h-20 rounded-xl object-cover shrink-0 cursor-zoom-in" />
                                </button>
                              ) : (
                                <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                                  <span className="text-[7px] font-black uppercase tracking-widest text-gray-300">Sem foto</span>
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <h4 className="font-black text-gray-900 text-base leading-none tracking-tighter truncate">{p.name}</h4>
                                    <p className="text-[10px] text-gray-500 mt-2 leading-relaxed font-bold line-clamp-2">{p.description}</p>
                                  </div>
                                  <div className="flex flex-col items-end shrink-0">
                                    {hasPromotion && (
                                      <span className="px-2 py-1 rounded-full bg-primary/15 text-primary text-[9px] font-black uppercase tracking-widest mb-1">
                                        Promocao • {promoBadge}
                                      </span>
                                    )}
                                    {hasPromotion && (
                                      <span className="text-[10px] font-black text-gray-400 line-through">{formatCurrency(p.price_cents)}</span>
                                    )}
                                    <span className="font-black text-primary text-lg tracking-tighter">{formatCurrency(unitPrice)}</span>
                                  </div>
                                </div>

                                {session?.status === 'OPEN' && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
                                    <div className="flex items-center gap-2">
                                      {!hasAddons && inCartQty > 0 && (
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
                                      )}
                                      {inCartQty > 0 && (
                                        <span className="text-[10px] font-black text-primary">{inCartQty} no carrinho</span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => (hasAddons ? openAddonSelector(p) : handleUpdateCart(p.id, 1))}
                                        disabled={hasOwnPendingApproval}
                                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        Adicionar
                                      </button>
                                      <button
                                        onClick={() => openAddonSelector(p)}
                                        disabled={hasOwnPendingApproval}
                                        className="text-[8px] font-black uppercase tracking-widest text-gray-500 underline disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        Obs/Adicional
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {showPromotionsOnly && visibleMenuCategories.length === 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Nenhum item em promocao para hoje.
                  </p>
                </div>
              )}

              {!showPromotionsOnly && visibleMenuCategories.length === 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Nenhum produto encontrado para essa busca.
                  </p>
                </div>
              )}
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
              <AppModal
                open={showAddonSelector}
                onClose={closeAddonSelector}
                title={pendingProduct.name}
                size="md"
                zIndex={90}
                footer={
                  <button
                    type="button"
                    onClick={async () => {
                      await handleAddProductWithAddons(pendingProduct, selectedAddonIds, productObservation);
                      closeAddonSelector();
                    }}
                    className="w-full bg-gray-900 text-white py-4 rounded-xl font-black uppercase tracking-widest text-[11px]"
                  >
                    {selectedAddonIds.length === 0 ? 'Adicionar' : 'Adicionar com adicionais'}
                  </button>
                }
              >
                <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-5">
                  {getProductAddons(pendingProduct.id).length === 0
                    ? 'Observacao opcional para este item'
                    : pendingProduct.addon_selection_mode === 'SINGLE'
                      ? 'Adicionais opcionais: escolha 1 ou nenhum'
                      : 'Adicionais opcionais: escolha quantos quiser ou nenhum'}
                </p>

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

                <div className="flex flex-col gap-2 mt-5">
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
              </AppModal>
            )}

            {previewImage && (
              <AppModal
                open={Boolean(previewImage)}
                onClose={() => setPreviewImage(null)}
                title={previewImage.name}
                size="md"
                zIndex={105}
                footer={
                  <button
                    type="button"
                    onClick={() => setPreviewImage(null)}
                    className="w-full py-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-700"
                  >
                    Fechar
                  </button>
                }
              >
                <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                  <img src={previewImage.url} alt={previewImage.name} className="w-full h-auto object-contain max-h-[70vh]" />
                </div>
              </AppModal>
            )}

            {showCart && (
              <AppModal
                open={showCart}
                onClose={() => setShowCart(false)}
                title={
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900 italic">Meu Carrinho</h3>
                    <p className="text-[8px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1.5 italic">Itens que voce vai enviar agora</p>
                  </div>
                }
                size="lg"
                zIndex={100}
                footer={
                  <div className="pt-1 flex flex-col gap-4">
                    {myCartPromotionDiscount > 0 && (
                      <div className="flex justify-between items-baseline font-black">
                        <span className="text-gray-400 text-[8px] uppercase tracking-[0.3em] font-black italic">Descontos de Promocao</span>
                        <span className="text-emerald-600 text-sm tracking-widest">- {formatCurrency(myCartPromotionDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline font-black">
                      <span className="text-gray-400 text-[8px] uppercase tracking-[0.3em] font-black italic">Total do Meu Pedido</span>
                      <span className="text-primary text-3xl tracking-tighter italic">{formatCurrency(myCartTotal)}</span>
                    </div>
                    {waiterFeeEnabledForCustomer && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 flex flex-col gap-1.5">
                        <p className="text-[8px] font-black uppercase tracking-widest text-amber-700">
                          Taxa de garcom no fechamento
                        </p>
                        <p className="text-[10px] font-black text-amber-700">
                          {waiterFeeModeForCustomer === 'PERCENT'
                            ? `${waiterFeePercentForCustomer}% aplicado sobre o total da mesa (ON_TABLE).`
                            : `${formatCurrency(waiterFeeFixedCentsForCustomer)} fixa por mesa (ON_TABLE).`}
                        </p>
                        {waiterFeeModeForCustomer === 'PERCENT' && (
                          <p className="text-[10px] font-black text-amber-800">
                            Estimativa do seu total com taxa: {formatCurrency(estimatedMyTotalWithWaiterFee)}
                          </p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={handleSendMyCart}
                      disabled={isLoading || myCartItems.length === 0 || hasOwnPendingApproval}
                      className="w-full bg-primary text-white py-4 rounded-xl font-black text-base uppercase tracking-widest transition-transform active:scale-95 italic disabled:opacity-60"
                    >
                      {isLoading ? 'Enviando...' : hasOwnPendingApproval ? 'Aguardando Responsavel' : 'Finalizar e Enviar'}
                    </button>
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  {myCartItems.map((item) => (
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
                          {Number(item.promo_discount_cents || 0) > 0 && (
                            <p className="text-[8px] text-emerald-600 uppercase font-black tracking-widest mt-1">
                              Promocao: -{formatCurrency(Number(item.promo_discount_cents || 0))}
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
              </AppModal>
            )}

            {showRatingModal && (
              <AppModal
                open={showRatingModal}
                onClose={() => setShowRatingModal(false)}
                title="Avaliar Loja"
                size="sm"
                zIndex={130}
                footer={
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRatingModal(false)}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitFeedback}
                      disabled={sendingRating}
                      className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      {sendingRating ? 'Enviando...' : 'Enviar Avaliacao'}
                    </button>
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Nota (obrigatorio)</p>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingStars(star)}
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center ${star <= ratingStars
                            ? 'bg-amber-50 border-amber-200 text-amber-500'
                            : 'bg-white border-gray-200 text-gray-300'
                            }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Nome/apelido (opcional)</label>
                    <input
                      value={ratingName}
                      onChange={(e) => setRatingName(e.target.value)}
                      maxLength={80}
                      className="w-full p-3 rounded-xl border border-gray-200 font-bold"
                      placeholder="Seu nome"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Comentario (opcional)</label>
                    <textarea
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      maxLength={400}
                      rows={4}
                      className="w-full p-3 rounded-xl border border-gray-200 font-bold"
                      placeholder="Conte para a gente como foi sua experiencia..."
                    />
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">
                      {ratingComment.length}/400
                    </p>
                  </div>
                </div>
              </AppModal>
            )}

          </div>
        )}
      </Layout>
    );
  };
}

export default App;
