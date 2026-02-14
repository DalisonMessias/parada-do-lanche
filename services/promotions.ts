import { Promotion, PromotionDiscountType } from '../types';

export type ResolvedPromotion = {
  id: string;
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  scope: 'GLOBAL' | 'PRODUCT';
};

const normalizeWeekdays = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
};

const isPromotionEnabledToday = (promotion: Promotion, weekday: number) => {
  if (!promotion?.active) return false;
  const weekdays = normalizeWeekdays(promotion.weekdays);
  return weekdays.includes(weekday);
};

const toResolved = (promotion: Promotion): ResolvedPromotion => ({
  id: promotion.id,
  name: promotion.name || 'Promocao',
  discountType: promotion.discount_type === 'PERCENT' ? 'PERCENT' : 'AMOUNT',
  discountValue: Math.max(0, Number(promotion.discount_value || 0)),
  scope: promotion.scope === 'PRODUCT' ? 'PRODUCT' : 'GLOBAL',
});

export const resolvePromotionForProduct = (
  productId: string,
  promotions: Promotion[],
  now: Date = new Date()
): ResolvedPromotion | null => {
  const weekday = now.getDay();
  const active = (promotions || []).filter((promotion) => isPromotionEnabledToday(promotion, weekday));
  if (active.length === 0) return null;

  const byProduct = active.find((promotion) => {
    if (promotion.scope !== 'PRODUCT') return false;
    const productIds = (promotion.promotion_products || []).map((row) => row.product_id);
    return productIds.includes(productId);
  });
  if (byProduct) return toResolved(byProduct);

  const global = active.find((promotion) => promotion.scope === 'GLOBAL');
  if (global) return toResolved(global);

  return null;
};

export const applyPromotionToPrice = (
  basePriceCents: number,
  promotion: ResolvedPromotion | null
) => {
  const normalizedBase = Math.max(0, Number(basePriceCents || 0));
  if (!promotion) {
    return {
      originalUnitPriceCents: normalizedBase,
      finalUnitPriceCents: normalizedBase,
      discountCents: 0,
      promoName: null as string | null,
      promoDiscountType: null as PromotionDiscountType | null,
      promoDiscountValue: 0,
      hasPromotion: false,
    };
  }

  let discountCents = 0;
  if (promotion.discountType === 'AMOUNT') {
    discountCents = Math.min(normalizedBase, Math.max(0, Number(promotion.discountValue || 0)));
  } else {
    const percent = Math.max(0, Math.min(100, Number(promotion.discountValue || 0)));
    discountCents = Math.round(normalizedBase * (percent / 100));
  }

  const finalUnitPriceCents = Math.max(0, normalizedBase - discountCents);
  return {
    originalUnitPriceCents: normalizedBase,
    finalUnitPriceCents,
    discountCents,
    promoName: promotion.name,
    promoDiscountType: promotion.discountType,
    promoDiscountValue: Math.max(0, Number(promotion.discountValue || 0)),
    hasPromotion: discountCents > 0,
  };
};

