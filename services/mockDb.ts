
import { Category, Product, Table, Session, Guest, CartItem, Order, OrderItem, OrderStatus } from '../types';

// Mock Data Initial State
const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat1', name: 'Lanches', sort_order: 1, active: true },
  { id: 'cat2', name: 'Bebidas', sort_order: 2, active: true },
  { id: 'cat3', name: 'Sobremesas', sort_order: 3, active: true },
];

const INITIAL_PRODUCTS: Product[] = [
  { id: 'p1', category_id: 'cat1', name: 'X-Tudo Mega', description: 'Hamburguer 200g, bacon, ovo, queijo, presunto, alface e tomate.', price_cents: 2890, image_url: 'https://picsum.photos/seed/burger1/400/300', addon_selection_mode: 'MULTIPLE', active: true, out_of_stock: false },
  { id: 'p2', category_id: 'cat1', name: 'Hot Dog Especial', description: '2 salsichas, pure, batata palha e milho.', price_cents: 1500, image_url: 'https://picsum.photos/seed/hotdog/400/300', addon_selection_mode: 'MULTIPLE', active: true, out_of_stock: false },
  { id: 'p3', category_id: 'cat2', name: 'Coca-Cola 350ml', description: 'Geladinha.', price_cents: 600, image_url: 'https://picsum.photos/seed/coke/400/300', addon_selection_mode: 'MULTIPLE', active: true, out_of_stock: false },
  { id: 'p4', category_id: 'cat2', name: 'Suco de Laranja', description: 'Natural 500ml.', price_cents: 1200, image_url: 'https://picsum.photos/seed/juice/400/300', addon_selection_mode: 'MULTIPLE', active: true, out_of_stock: false },
];

const INITIAL_TABLES: Table[] = [
  { id: 't1', name: 'Mesa 01', token: 'mesa-01-token-abc', status: 'FREE' },
  { id: 't2', name: 'Mesa 02', token: 'mesa-02-token-def', status: 'FREE' },
  { id: 't3', name: 'Mesa 03', token: 'mesa-03-token-ghi', status: 'FREE' },
];

class MockDatabase {
  private categories: Category[] = [...INITIAL_CATEGORIES];
  private products: Product[] = [...INITIAL_PRODUCTS];
  private tables: Table[] = [...INITIAL_TABLES];
  private sessions: Session[] = [];
  private guests: Guest[] = [];
  private cartItems: CartItem[] = [];
  private orders: Order[] = [];
  private orderItems: OrderItem[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const data = localStorage.getItem('parada_lanche_db');
    if (data) {
      const parsed = JSON.parse(data);
      this.categories = parsed.categories || INITIAL_CATEGORIES;
      this.products = parsed.products || INITIAL_PRODUCTS;
      this.tables = parsed.tables || INITIAL_TABLES;
      this.sessions = parsed.sessions || [];
      this.guests = parsed.guests || [];
      this.cartItems = parsed.cartItems || [];
      this.orders = parsed.orders || [];
      this.orderItems = parsed.orderItems || [];
    }
  }

  private save() {
    localStorage.setItem('parada_lanche_db', JSON.stringify({
      categories: this.categories,
      products: this.products,
      tables: this.tables,
      sessions: this.sessions,
      guests: this.guests,
      cartItems: this.cartItems,
      orders: this.orders,
      orderItems: this.orderItems,
    }));
  }

  // --- API Methods ---

  getCategories() { return this.categories.filter(c => c.active).sort((a, b) => a.sort_order - b.sort_order); }
  getProducts() { return this.products.filter(p => p.active); }
  getTables() { return this.tables; }

  getTableByToken(token: string) {
    return this.tables.find(t => t.token === token);
  }

  getActiveSessionForTable(tableId: string) {
    return this.sessions.find(s => s.table_id === tableId && s.status === 'OPEN');
  }

  createSession(tableId: string, hostName: string) {
    const sessionId = Math.random().toString(36).substr(2, 9);
    const guestId = Math.random().toString(36).substr(2, 9);
    
    const newSession: Session = {
      id: sessionId,
      table_id: tableId,
      status: 'OPEN',
      host_guest_id: guestId,
      created_at: new Date().toISOString()
    };
    
    const newGuest: Guest = {
      id: guestId,
      session_id: sessionId,
      name: hostName,
      is_host: true
    };

    this.sessions.push(newSession);
    this.guests.push(newGuest);
    
    // Mark table as occupied
    const tableIndex = this.tables.findIndex(t => t.id === tableId);
    if (tableIndex > -1) this.tables[tableIndex].status = 'OCCUPIED';

    this.save();
    return { session: newSession, guest: newGuest };
  }

  joinSession(sessionId: string, guestName: string) {
    const guestId = Math.random().toString(36).substr(2, 9);
    const newGuest: Guest = {
      id: guestId,
      session_id: sessionId,
      name: guestName,
      is_host: false
    };
    this.guests.push(newGuest);
    this.save();
    return newGuest;
  }

  getCart(sessionId: string) {
    return this.cartItems
      .filter(item => item.session_id === sessionId)
      .map(item => ({
        ...item,
        product: this.products.find(p => p.id === item.product_id),
        guest_name: this.guests.find(g => g.id === item.guest_id)?.name
      }));
  }

  updateCartItem(sessionId: string, guestId: string, productId: string, delta: number, note?: string) {
    let item = this.cartItems.find(i => i.session_id === sessionId && i.guest_id === guestId && i.product_id === productId);
    
    if (item) {
      item.qty += delta;
      if (note !== undefined) item.note = note;
      if (item.qty <= 0) {
        this.cartItems = this.cartItems.filter(i => i.id !== item!.id);
      }
    } else if (delta > 0) {
      item = {
        id: Math.random().toString(36).substr(2, 9),
        session_id: sessionId,
        guest_id: guestId,
        product_id: productId,
        qty: delta,
        note: note || ''
      };
      this.cartItems.push(item);
    }
    this.save();
  }

  finalizeOrder(sessionId: string) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return null;

    const items = this.getCart(sessionId);
    if (items.length === 0) return null;

    const totalCents = items.reduce((acc, item) => acc + (item.product?.price_cents || 0) * item.qty, 0);
    const orderId = Math.random().toString(36).substr(2, 9);

    const newOrder: Order = {
      id: orderId,
      table_id: session.table_id,
      session_id: sessionId,
      status: 'PENDING',
      total_cents: totalCents,
      created_at: new Date().toISOString()
    };

    items.forEach(item => {
      this.orderItems.push({
        id: Math.random().toString(36).substr(2, 9),
        order_id: orderId,
        product_id: item.product_id,
        name_snapshot: item.product?.name || 'Unknown',
        unit_price_cents: item.product?.price_cents || 0,
        qty: item.qty,
        note: item.note,
        added_by_name: item.guest_name || 'Anonymous'
      });
    });

    session.status = 'LOCKED';
    this.orders.push(newOrder);
    this.cartItems = this.cartItems.filter(i => i.session_id !== sessionId);
    this.save();
    return newOrder;
  }

  getOrders() {
    return this.orders.map(o => ({
      ...o,
      table_name: this.tables.find(t => t.id === o.table_id)?.name,
      items: this.orderItems.filter(oi => oi.order_id === o.id)
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  updateOrderStatus(orderId: string, status: OrderStatus) {
    const orderIndex = this.orders.findIndex(o => o.id === orderId);
    if (orderIndex > -1) {
      this.orders[orderIndex].status = status;
      if (status === 'FINISHED' || status === 'CANCELLED') {
        const order = this.orders[orderIndex];
        const session = this.sessions.find(s => s.id === order.session_id);
        if (session) {
          session.status = 'EXPIRED';
          const tableIndex = this.tables.findIndex(t => t.id === session.table_id);
          if (tableIndex > -1) this.tables[tableIndex].status = 'FREE';
        }
      }
      this.save();
    }
  }
}

export const db = new MockDatabase();

