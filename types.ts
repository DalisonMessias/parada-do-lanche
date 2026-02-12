
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'FINISHED' | 'CANCELLED';
export type UserRole = 'ADMIN' | 'MANAGER' | 'WAITER';
export type OrderApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type OrderApprovalMode = 'HOST' | 'SELF';

export interface StoreSettings {
  id: string;
  store_name: string;
  primary_color: string;
  logo_url: string;
  wifi_ssid: string;
  wifi_password: string;
  sticker_bg_color: string;
  sticker_text_color: string;
  sticker_border_color: string;
  sticker_muted_text_color: string;
  sticker_qr_frame_color: string;
  order_approval_mode?: OrderApprovalMode;
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
  addon_selection_mode: 'SINGLE' | 'MULTIPLE';
  active: boolean;
  out_of_stock: boolean;
}

export interface ProductAddon {
  id: string;
  product_id: string;
  name: string;
  price_cents: number;
  active: boolean;
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
  closed_at?: string | null;
  table?: { name: string } | null;
  guests?: Guest[];
  orders?: Order[];
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
  addon_ids?: string[];
  addon_names?: string[];
  addon_total_cents?: number;
}

export interface Order {
  id: string;
  table_id: string;
  session_id: string;
  status: OrderStatus;
  approval_status?: OrderApprovalStatus;
  created_by_guest_id?: string | null;
  approved_by_guest_id?: string | null;
  approved_at?: string | null;
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
  status?: 'PENDING' | 'READY';
  note?: string;
  added_by_name: string;
}

export type AppView = 'LANDING' | 'CUSTOMER_MENU' | 'ADMIN_LOGIN' | 'ADMIN_DASHBOARD' | 'TEMP_REGISTER';
