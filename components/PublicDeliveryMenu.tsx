import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, supabase } from '../services/supabase';
import { applyPromotionToPrice, resolvePromotionForProduct } from '../services/promotions';
import { buildLineItemKey } from '../services/orderItemGrouping';
import {
  DeliveryCartItem,
  getDeliveryCartCount,
  getDeliveryCartPromotionDiscount,
  getDeliveryCartTotal,
  readDeliveryCart,
  readDeliveryPrompt,
  saveDeliveryCart,
} from '../services/deliverySession';
import { Category, Product, ProductAddon, Promotion } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import AppModal from './ui/AppModal';

const PROMOTIONS_TAB_ID = '__DELIVERY_PROMOTIONS__';

const makeItemNote = (addonNames: string[], observation: string) => {
  const lines: string[] = [];
  if (addonNames.length > 0) lines.push(`Adicionais: ${addonNames.join(', ')}`);
  const cleanObs = observation.trim();
  if (cleanObs) lines.push(`Observacao: ${cleanObs}`);
  return lines.length > 0 ? lines.join('\n') : null;
};

const makeId = () => Math.random().toString(36).slice(2);

const PublicDeliveryMenu: React.FC = () => {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<DeliveryCartItem[]>(() => readDeliveryCart());
  const [showCart, setShowCart] = useState(false);
  const [showAddonSelector, setShowAddonSelector] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingObservation, setPendingObservation] = useState('');
  const [pendingAddonIds, setPendingAddonIds] = useState<string[]>([]);
  const prompt = useMemo(() => readDeliveryPrompt(), []);

  useEffect(() => {
    saveDeliveryCart(cart);
  }, [cart]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [catRes, prodRes, addonRes, promoRes] = await Promise.all([
        supabase.from('categories').select('*').eq('active', true).order('sort_order'),
        supabase.from('products').select('*').eq('active', true).order('name'),
        supabase.from('product_addons').select('*').eq('active', true).order('name'),
        supabase
          .from('promotions')
          .select('*, promotion_products(product_id)')
          .eq('active', true)
          .order('created_at', { ascending: false }),
      ]);

      if (!active) return;
      if (catRes.error) toast(`Falha ao carregar categorias: ${catRes.error.message}`, 'error');
      if (prodRes.error) toast(`Falha ao carregar produtos: ${prodRes.error.message}`, 'error');
      if (addonRes.error) toast(`Falha ao carregar adicionais: ${addonRes.error.message}`, 'error');
      if (promoRes.error) toast(`Falha ao carregar promocoes: ${promoRes.error.message}`, 'error');

      setCategories((catRes.data || []) as Category[]);
      setProducts((prodRes.data || []) as Product[]);
      setAddons((addonRes.data || []) as ProductAddon[]);
      setPromotions((promoRes.data || []) as Promotion[]);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [toast]);

  const getProductAddons = (productId: string) =>
    addons.filter((addon) => addon.product_id === productId);

  const getProductPricing = (product: Product) => {
    const promotion = resolvePromotionForProduct(product.id, promotions);
    return applyPromotionToPrice(product.price_cents || 0, promotion);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const selectedCategoryId =
    selectedCategory && selectedCategory !== PROMOTIONS_TAB_ID ? selectedCategory : null;
  const showPromotionsOnly = selectedCategory === PROMOTIONS_TAB_ID;

  const deliveryProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.active !== false &&
          product.out_of_stock !== true &&
          product.available_on_delivery !== false
      ),
    [products]
  );

  const filteredProductsBySearch = useMemo(() => {
    if (!normalizedSearch) return deliveryProducts;
    return deliveryProducts.filter((product) => {
      const categoryName =
        categories.find((category) => category.id === product.category_id)?.name || '';
      const searchableText = `${product.name} ${product.description || ''} ${categoryName}`.toLowerCase();
      return searchableText.includes(normalizedSearch);
    });
  }, [deliveryProducts, categories, normalizedSearch]);

  const filteredProductIds = useMemo(
    () => new Set(filteredProductsBySearch.map((product) => product.id)),
    [filteredProductsBySearch]
  );

  const promotionProductIds = useMemo(() => {
    const ids = new Set<string>();
    deliveryProducts.forEach((product) => {
      const pricing = getProductPricing(product);
      if (pricing.hasPromotion) ids.add(product.id);
    });
    return ids;
  }, [deliveryProducts, promotions]);

  const visibleCategories = useMemo(() => {
    return categories.filter((category) => {
      if (selectedCategoryId && category.id !== selectedCategoryId) return false;
      const categoryProducts = deliveryProducts.filter(
        (product) => product.category_id === category.id && filteredProductIds.has(product.id)
      );
      if (categoryProducts.length === 0) return false;
      if (showPromotionsOnly) {
        return categoryProducts.some((product) => promotionProductIds.has(product.id));
      }
      return true;
    });
  }, [
    categories,
    deliveryProducts,
    filteredProductIds,
    selectedCategoryId,
    showPromotionsOnly,
    promotionProductIds,
  ]);

  const addToCart = (item: DeliveryCartItem) => {
    setCart((prev) => {
      const note = makeItemNote(item.addon_names, item.observation);
      const nextKey = `${item.product_id}::${buildLineItemKey({
        name_snapshot: item.product_name,
        unit_price_cents: item.unit_price_cents,
        note,
      })}`;
      const existingIndex = prev.findIndex((row) => {
        const rowNote = makeItemNote(row.addon_names, row.observation);
        const rowKey = `${row.product_id}::${buildLineItemKey({
          name_snapshot: row.product_name,
          unit_price_cents: row.unit_price_cents,
          note: rowNote,
        })}`;
        return rowKey === nextKey;
      });

      if (existingIndex < 0) {
        return [...prev, item];
      }
      return prev.map((row, index) =>
        index === existingIndex
          ? {
              ...row,
              qty: row.qty + item.qty,
            }
          : row
      );
    });
  };

  const openAddonSelector = (product: Product) => {
    setPendingProduct(product);
    setPendingObservation('');
    setPendingAddonIds([]);
    setShowAddonSelector(true);
  };

  const closeAddonSelector = () => {
    setPendingProduct(null);
    setPendingObservation('');
    setPendingAddonIds([]);
    setShowAddonSelector(false);
  };

  const toggleAddon = (product: Product, addonId: string) => {
    const mode = product.addon_selection_mode || 'MULTIPLE';
    if (mode === 'SINGLE') {
      setPendingAddonIds((prev) => (prev[0] === addonId ? [] : [addonId]));
      return;
    }
    setPendingAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const handleAddProduct = (product: Product) => {
    const productAddons = getProductAddons(product.id);
    if (productAddons.length > 0) {
      openAddonSelector(product);
      return;
    }
    const pricing = getProductPricing(product);
    addToCart({
      id: makeId(),
      product_id: product.id,
      product_name: product.name,
      qty: 1,
      base_price_cents: pricing.originalUnitPriceCents,
      addon_total_cents: 0,
      unit_price_cents: pricing.finalUnitPriceCents,
      promo_name: pricing.promoName,
      promo_discount_type: pricing.promoDiscountType,
      promo_discount_value: pricing.promoDiscountValue,
      promo_discount_cents: pricing.discountCents,
      addon_names: [],
      observation: '',
    });
    toast(`${product.name} adicionado ao carrinho.`, 'success');
  };

  const handleConfirmAddons = () => {
    if (!pendingProduct) return;
    const selectedAddons = getProductAddons(pendingProduct.id).filter((addon) =>
      pendingAddonIds.includes(addon.id)
    );
    const addonTotal = selectedAddons.reduce((acc, addon) => acc + addon.price_cents, 0);
    const pricing = getProductPricing(pendingProduct);
    addToCart({
      id: makeId(),
      product_id: pendingProduct.id,
      product_name: pendingProduct.name,
      qty: 1,
      base_price_cents: pricing.originalUnitPriceCents,
      addon_total_cents: addonTotal,
      unit_price_cents: pricing.finalUnitPriceCents + addonTotal,
      promo_name: pricing.promoName,
      promo_discount_type: pricing.promoDiscountType,
      promo_discount_value: pricing.promoDiscountValue,
      promo_discount_cents: pricing.discountCents,
      addon_names: selectedAddons.map((addon) => addon.name),
      observation: pendingObservation.trim(),
    });
    toast(`${pendingProduct.name} adicionado ao carrinho.`, 'success');
    closeAddonSelector();
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const cartCount = getDeliveryCartCount(cart);
  const cartTotal = getDeliveryCartTotal(cart);
  const cartPromotionDiscount = getDeliveryCartPromotionDiscount(cart);

  if (loading) {
    return (
      <div className="min-h-[80vh] p-6 flex items-center justify-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Carregando menu de entrega...</p>
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-8 pb-28 space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Entrega</p>
        <h2 className="text-xl lg:text-2xl font-black text-gray-900 uppercase tracking-tighter">
          Menu Digital de Entrega
        </h2>
        {prompt && (
          <p className="text-sm font-bold text-gray-600">
            <span className="text-gray-400 uppercase text-[10px] tracking-widest font-black mr-2">Seu pedido:</span>
            {prompt}
          </p>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar item..."
          className="w-full p-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-primary"
        />
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border shrink-0 ${
              !selectedCategory
                ? 'bg-primary text-white border-primary'
                : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setSelectedCategory(PROMOTIONS_TAB_ID)}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border shrink-0 ${
              showPromotionsOnly
                ? 'bg-primary text-white border-primary'
                : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}
          >
            Promocoes
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border shrink-0 ${
                selectedCategory === category.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      {visibleCategories.length === 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Nenhum produto disponivel para entrega.
          </p>
        </section>
      )}

      {visibleCategories.map((category) => {
        let categoryProducts = deliveryProducts.filter(
          (product) => product.category_id === category.id && filteredProductIds.has(product.id)
        );
        if (showPromotionsOnly) {
          categoryProducts = categoryProducts.filter((product) => promotionProductIds.has(product.id));
        }
        if (categoryProducts.length === 0) return null;
        return (
          <section key={category.id} className="space-y-3">
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">{category.name}</h3>
            <div className="grid gap-3">
              {categoryProducts.map((product) => {
                const pricing = getProductPricing(product);
                const hasPromotion = pricing.hasPromotion;
                return (
                  <article key={product.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                    <div className="flex gap-3">
                      {(product.image_url || '').trim() ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-20 h-20 rounded-xl object-cover border border-gray-100"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                          <span className="text-[8px] font-black uppercase tracking-widest text-gray-300">
                            Sem foto
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-gray-900 text-base leading-none">{product.name}</p>
                            <p className="text-[10px] text-gray-500 font-bold mt-1 line-clamp-2">{product.description}</p>
                          </div>
                          <div className="text-right">
                            {hasPromotion && (
                              <p className="text-[10px] font-black text-gray-400 line-through">
                                {formatCurrency(product.price_cents)}
                              </p>
                            )}
                            <p className="font-black text-primary text-lg tracking-tighter">
                              {formatCurrency(pricing.finalUnitPriceCents)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-end">
                          <button
                            onClick={() => handleAddProduct(product)}
                            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest"
                          >
                            Adicionar
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-40">
          <button
            onClick={() => setShowCart(true)}
            className="w-full max-w-md mx-auto bg-gray-900 text-white p-4 rounded-xl flex justify-between items-center"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                {cartCount}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest">Meu Carrinho</span>
            </div>
            <span className="font-black text-primary text-lg">{formatCurrency(cartTotal)}</span>
          </button>
        </div>
      )}

      {showCart && (
        <AppModal
          open={showCart}
          onClose={() => setShowCart(false)}
          size="lg"
          zIndex={120}
          title={
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900">Carrinho de Entrega</h3>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1">
                Itens para receber em casa
              </p>
            </div>
          }
          footer={
            <div className="space-y-3">
              {cartPromotionDiscount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Descontos</span>
                  <span className="font-black text-emerald-600">- {formatCurrency(cartPromotionDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total</span>
                <span className="font-black text-xl text-primary">{formatCurrency(cartTotal)}</span>
              </div>
              <button
                type="button"
                onClick={() => window.history.pushState({}, '', '/entrega/checkout')}
                className="w-full py-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest"
              >
                Pedir
              </button>
            </div>
          }
        >
          <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
            {cart.map((item) => (
              <article key={item.id} className="border border-gray-100 rounded-xl p-3 flex justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-black text-gray-800">
                    {item.qty}x {item.product_name}
                  </p>
                  {item.addon_names.length > 0 && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                      + {item.addon_names.join(', ')}
                    </p>
                  )}
                  {!!item.observation && (
                    <p className="text-[10px] font-black text-gray-500">Obs: {item.observation}</p>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <p className="text-sm font-black text-gray-900">
                    {formatCurrency(item.unit_price_cents * item.qty)}
                  </p>
                  <div className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1">
                    <button
                      type="button"
                      onClick={() => changeQty(item.id, -1)}
                      className="text-base font-black text-gray-500"
                    >
                      -
                    </button>
                    <span className="text-xs font-black text-gray-800">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => changeQty(item.id, 1)}
                      className="text-base font-black text-primary"
                    >
                      +
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </AppModal>
      )}

      {showAddonSelector && pendingProduct && (
        <AppModal
          open={showAddonSelector}
          onClose={closeAddonSelector}
          title={pendingProduct.name}
          size="md"
          zIndex={120}
          footer={
            <button
              type="button"
              onClick={handleConfirmAddons}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-black uppercase tracking-widest text-[11px]"
            >
              Adicionar ao carrinho
            </button>
          }
        >
          <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-4">
            Escolha adicionais e observacoes (opcional)
          </p>
          <div className="flex flex-col gap-2">
            {getProductAddons(pendingProduct.id).map((addon) => {
              const selected = pendingAddonIds.includes(addon.id);
              return (
                <button
                  key={addon.id}
                  type="button"
                  onClick={() => toggleAddon(pendingProduct, addon.id)}
                  className={`w-full flex items-center justify-between rounded-xl border p-3 ${
                    selected ? 'border-primary bg-orange-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="font-black text-sm text-gray-800">{addon.name}</span>
                  <span className="font-black text-sm text-primary">+ {formatCurrency(addon.price_cents)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 mt-5">
            <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
              Observacao (opcional)
            </label>
            <textarea
              rows={3}
              value={pendingObservation}
              onChange={(e) => setPendingObservation(e.target.value)}
              placeholder="Ex.: sem cebola, molho separado..."
              maxLength={180}
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700 outline-none focus:border-primary"
            />
          </div>
        </AppModal>
      )}
    </div>
  );
};

export default PublicDeliveryMenu;

