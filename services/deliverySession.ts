import { PromotionDiscountType } from '../types';

export type DeliveryPaymentMethod = 'PIX' | 'CASH' | 'CARD';

export type DeliveryCartItem = {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  base_price_cents: number;
  addon_total_cents: number;
  unit_price_cents: number;
  promo_name: string | null;
  promo_discount_type: PromotionDiscountType | null;
  promo_discount_value: number;
  promo_discount_cents: number;
  addon_names: string[];
  observation: string;
};

export type DeliveryCheckoutPayload = {
  customer_name: string;
  customer_phone: string;
  delivery_address: {
    street: string;
    number: string;
    neighborhood: string;
    complement?: string;
    reference?: string;
  };
  general_note?: string;
  payment_method: DeliveryPaymentMethod;
  cash_change_for_cents: number;
};

const DELIVERY_CART_KEY = 'delivery_cart_v1';
const DELIVERY_PROMPT_KEY = 'delivery_prompt_v1';

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const readDeliveryCart = () =>
  safeParse<DeliveryCartItem[]>(
    typeof window !== 'undefined' ? window.localStorage.getItem(DELIVERY_CART_KEY) : null,
    []
  );

export const saveDeliveryCart = (items: DeliveryCartItem[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DELIVERY_CART_KEY, JSON.stringify(items || []));
};

export const clearDeliveryCart = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DELIVERY_CART_KEY);
};

export const getDeliveryCartCount = (items: DeliveryCartItem[]) =>
  (items || []).reduce((acc, item) => acc + Math.max(0, Number(item.qty || 0)), 0);

export const getDeliveryCartTotal = (items: DeliveryCartItem[]) =>
  (items || []).reduce(
    (acc, item) => acc + Math.max(0, Number(item.qty || 0)) * Math.max(0, Number(item.unit_price_cents || 0)),
    0
  );

export const getDeliveryCartPromotionDiscount = (items: DeliveryCartItem[]) =>
  (items || []).reduce(
    (acc, item) =>
      acc +
      Math.max(0, Number(item.qty || 0)) *
        Math.max(0, Number(item.promo_discount_cents || 0)),
    0
  );

export const readDeliveryPrompt = () =>
  typeof window !== 'undefined' ? (window.localStorage.getItem(DELIVERY_PROMPT_KEY) || '').trim() : '';

export const saveDeliveryPrompt = (value: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DELIVERY_PROMPT_KEY, String(value || '').trim());
};

export const clearDeliveryPrompt = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DELIVERY_PROMPT_KEY);
};

