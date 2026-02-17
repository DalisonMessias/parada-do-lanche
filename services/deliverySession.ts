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
const DELIVERY_CHECKOUT_KEY = 'delivery_checkout_v1';

export type DeliveryCheckoutDraft = {
  customer_name: string;
  customer_phone: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  reference: string;
  observation: string;
  payment_method: DeliveryPaymentMethod;
  needs_change: boolean;
  cash_change_for_cents: number;
};

const EMPTY_DELIVERY_CHECKOUT_DRAFT: DeliveryCheckoutDraft = {
  customer_name: '',
  customer_phone: '',
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  reference: '',
  observation: '',
  payment_method: 'CARD',
  needs_change: false,
  cash_change_for_cents: 0,
};

const normalizeDeliveryCheckoutDraft = (
  raw?: Partial<DeliveryCheckoutDraft> | null
): DeliveryCheckoutDraft => {
  const paymentMethod: DeliveryPaymentMethod =
    raw?.payment_method === 'PIX' || raw?.payment_method === 'CASH' || raw?.payment_method === 'CARD'
      ? raw.payment_method
      : 'CARD';
  const changeForCents = Number(raw?.cash_change_for_cents || 0);

  return {
    customer_name: String(raw?.customer_name || ''),
    customer_phone: String(raw?.customer_phone || ''),
    street: String(raw?.street || ''),
    number: String(raw?.number || ''),
    neighborhood: String(raw?.neighborhood || ''),
    complement: String(raw?.complement || ''),
    reference: String(raw?.reference || ''),
    observation: String(raw?.observation || ''),
    payment_method: paymentMethod,
    needs_change: Boolean(raw?.needs_change),
    cash_change_for_cents:
      Number.isFinite(changeForCents) && changeForCents > 0 ? Math.round(changeForCents) : 0,
  };
};

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

export const readDeliveryCheckoutDraft = (): DeliveryCheckoutDraft => {
  if (typeof window === 'undefined') return EMPTY_DELIVERY_CHECKOUT_DRAFT;
  const parsed = safeParse<Partial<DeliveryCheckoutDraft> | null>(
    window.localStorage.getItem(DELIVERY_CHECKOUT_KEY),
    null
  );
  if (!parsed) return EMPTY_DELIVERY_CHECKOUT_DRAFT;
  return normalizeDeliveryCheckoutDraft(parsed);
};

export const saveDeliveryCheckoutDraft = (draft: Partial<DeliveryCheckoutDraft>) => {
  if (typeof window === 'undefined') return;
  const normalized = normalizeDeliveryCheckoutDraft(draft);
  window.localStorage.setItem(DELIVERY_CHECKOUT_KEY, JSON.stringify(normalized));
};
