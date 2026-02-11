
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'FINISHED' | 'CANCELLED';
export type UserRole = 'ADMIN' | 'MANAGER' | 'WAITER';

export interface StoreSettings {
  id: string;
  store_name: string;
  primary_color: string;
  logo_url: string;
}

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string;
  active: boolean;
  out_of_stock: boolean;
}

export interface Table {
  id: string;
  name: string;
  token: string;
  status: 'FREE' | 'OCCUPIED';
}

export interface Session {
  id: string;
  table_id: string;
  status: 'OPEN' | 'LOCKED' | 'EXPIRED';
  host_guest_id: string;
  created_at: string;
}

export interface Guest {
  id: string;
  session_id: string;
  name: string;
  is_host: boolean;
}

export interface CartItem {
  id: string;
  session_id: string;
  guest_id: string;
  product_id: string;
  qty: number;
  note?: string;
  product?: Product;
  guest_name?: string;
}

export interface Order {
  id: string;
  table_id: string;
  session_id: string;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  table_name?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name_snapshot: string;
  unit_price_cents: number;
  qty: number;
  note?: string;
  added_by_name: string;
}

export type AppView = 'LANDING' | 'CUSTOMER_MENU' | 'ADMIN_LOGIN' | 'ADMIN_DASHBOARD' | 'TEMP_REGISTER';
