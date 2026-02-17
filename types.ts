
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'FINISHED' | 'CANCELLED';
export type UserRole = 'ADMIN' | 'MANAGER' | 'WAITER';
export type OrderApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type OrderApprovalMode = 'HOST' | 'SELF';
export type OrderOrigin = 'CUSTOMER' | 'WAITER' | 'BALCAO';
export type DiscountMode = 'NONE' | 'AMOUNT' | 'PERCENT';
export type TableType = 'DINING' | 'COUNTER';
export type ServiceType = 'ON_TABLE' | 'RETIRADA' | 'ENTREGA' | 'CONSUMO_LOCAL';
export type WaiterFeeMode = 'PERCENT' | 'FIXED';
export type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'random';
export type PromotionScope = 'GLOBAL' | 'PRODUCT';
export type PromotionDiscountType = 'AMOUNT' | 'PERCENT';
export type DeliveryPaymentMethod = 'PIX' | 'CASH' | 'CARD';

export interface DeliveryAddress {
  street: string;
  number: string;
  neighborhood: string;
  complement?: string;
  reference?: string;
}

export interface StoreSettings {
  id: string;
  store_name: string;
  logo_url: string;
  wifi_ssid: string;
  wifi_password: string;
  has_thermal_printer?: boolean;
  pix_key_type?: PixKeyType | null;
  pix_key_value?: string | null;
  pix_checkout_chave?: string | null;
  pix_checkout_nome_recebedor?: string | null;
  pix_checkout_cidade_recebedor?: string | null;
  pix_checkout_descricao?: string | null;
  pix_checkout_txid?: string | null;
  pix_checkout_reutilizavel?: boolean | null;
  notification_sound_enabled?: boolean;
  notification_sound_url?: string;
  auto_print_menu_digital?: boolean;
  sticker_bg_color: string;
  sticker_text_color: string;
  sticker_border_color: string;
  sticker_muted_text_color: string;
  sticker_qr_frame_color: string;
  order_approval_mode?: OrderApprovalMode;
  enable_counter_module?: boolean;
  enable_delivery_module?: boolean;
  default_delivery_fee_cents?: number;
  enable_waiter_fee?: boolean;
  waiter_fee_mode?: WaiterFeeMode;
  waiter_fee_value?: number;
  plan_name?: string;
  plan_price?: number;
  plan_due_day?: number;
  plan_current_due_date?: string;
  plan_status?: 'PAID' | 'OPEN' | 'OVERDUE' | 'SUSPENDED';
  plan_paid_at?: string;
  updated_at?: string | null;
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
  available_on_table?: boolean;
  available_on_delivery?: boolean;
  is_featured?: boolean;
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

export interface Promotion {
  id: string;
  name: string;
  scope: PromotionScope;
  discount_type: PromotionDiscountType;
  discount_value: number;
  weekdays: number[];
  active: boolean;
  created_at?: string;
  updated_at?: string;
  promotion_products?: { product_id: string }[];
}

export interface StoreFeedback {
  id: string;
  store_id: number;
  stars: number;
  comment?: string | null;
  customer_name?: string | null;
  source: string;
  table_id?: string | null;
  session_id?: string | null;
  order_id?: string | null;
  device_token?: string | null;
  created_at: string;
}

export interface Table {
  id: string;
  name: string;
  token: string;
  status: 'FREE' | 'OCCUPIED';
  table_type?: TableType;
}

export interface Session {
  id: string;
  table_id: string;
  status: 'OPEN' | 'LOCKED' | 'EXPIRED';
  host_guest_id: string;
  created_at: string;
  closed_at?: string | null;
  total_final?: number | null;
  items_total_final?: number | null;
  last_print_at?: string | null;
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
  observation?: string;
  base_price_cents?: number;
  promo_name?: string | null;
  promo_discount_type?: PromotionDiscountType | null;
  promo_discount_value?: number;
  promo_discount_cents?: number;
}

export interface Order {
  id: string;
  table_id: string;
  session_id: string;
  status: OrderStatus;
  origin?: OrderOrigin;
  parent_order_id?: string | null;
  created_by_profile_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  general_note?: string | null;
  approval_status?: OrderApprovalStatus;
  created_by_guest_id?: string | null;
  approved_by_guest_id?: string | null;
  approved_at?: string | null;
  round_number?: number;
  printed_at?: string | null;
  printed_count?: number;
  receipt_token?: string | null;
  receipt_token_created_at?: string | null;
  subtotal_cents?: number;
  discount_mode?: DiscountMode;
  discount_value?: number;
  discount_cents?: number;
  service_type?: ServiceType;
  delivery_fee_cents?: number;
  delivery_address?: DeliveryAddress | null;
  delivery_payment_method?: DeliveryPaymentMethod | null;
  delivery_cash_change_for_cents?: number | null;
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
  original_unit_price_cents?: number | null;
  unit_price_cents: number;
  qty: number;
  status?: 'PENDING' | 'READY';
  printed_at?: string | null;
  note?: string;
  promo_name?: string | null;
  promo_discount_type?: PromotionDiscountType | null;
  promo_discount_value?: number | null;
  promo_discount_cents?: number | null;
  added_by_name: string;
}

export type AppView =
  | 'LANDING'
  | 'CUSTOMER_MENU'
  | 'DELIVERY_INTRO'
  | 'DELIVERY_MENU'
  | 'DELIVERY_CHECKOUT'
  | 'ADMIN_LOGIN'
  | 'ADMIN_DASHBOARD'
  | 'TEMP_REGISTER'
  | 'PUBLIC_RECEIPT'
  | 'ADMIN_PLAN'
  | 'PUBLIC_PLAN_PAYMENT'
  | 'UAITECH_PIX_SETTINGS'
  | 'PIX_CHECKOUT'
  | 'MAINTENANCE'
  | 'NOT_FOUND';
