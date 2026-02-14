import React, { useEffect, useMemo, useState } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { Product, Promotion, PromotionDiscountType, PromotionScope } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import AppModal from './ui/AppModal';
import CustomSelect from './ui/CustomSelect';

type PromotionRow = Promotion & {
  promotion_products?: { product_id: string }[];
};

const weekdaysLabel: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sab',
};

const allWeekdays = [0, 1, 2, 3, 4, 5, 6];

const parseCurrencyToCents = (value: string) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

const formatCentsInput = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((cents || 0) / 100);

const AdminPromotions: React.FC = () => {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(false);
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<PromotionScope>('GLOBAL');
  const [discountType, setDiscountType] = useState<PromotionDiscountType>('PERCENT');
  const [discountValue, setDiscountValue] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([...allWeekdays]);
  const [active, setActive] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const load = async () => {
    const [promoRes, productsRes] = await Promise.all([
      supabase.from('promotions').select('*, promotion_products(product_id)').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
    ]);

    if (promoRes.error) {
      toast(`Erro ao carregar promocoes: ${promoRes.error.message}`, 'error');
    } else {
      setPromotions((promoRes.data || []) as PromotionRow[]);
    }
    if (productsRes.error) {
      toast(`Erro ao carregar produtos: ${productsRes.error.message}`, 'error');
    } else {
      setProducts((productsRes.data || []) as Product[]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setScope('GLOBAL');
    setDiscountType('PERCENT');
    setDiscountValue('');
    setWeekdays([...allWeekdays]);
    setActive(true);
    setSelectedProducts([]);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (promotion: PromotionRow) => {
    setEditing(promotion);
    setName(promotion.name || '');
    setScope((promotion.scope || 'GLOBAL') as PromotionScope);
    setDiscountType((promotion.discount_type || 'PERCENT') as PromotionDiscountType);
    setDiscountValue(
      promotion.discount_type === 'AMOUNT'
        ? formatCentsInput(Number(promotion.discount_value || 0))
        : String(Number(promotion.discount_value || 0))
    );
    setWeekdays(Array.isArray(promotion.weekdays) && promotion.weekdays.length > 0 ? promotion.weekdays.map(Number) : [...allWeekdays]);
    setActive(promotion.active !== false);
    setSelectedProducts((promotion.promotion_products || []).map((row) => row.product_id));
    setShowModal(true);
  };

  const hasConflict = (promotionId: string | null, productIds: string[], days: number[]) => {
    const daySet = new Set(days);
    const existing = promotions.filter((promotion) => {
      if (!promotion.active) return false;
      if (promotion.id === promotionId) return false;
      if (promotion.scope !== 'PRODUCT') return false;
      const overlapDay = (promotion.weekdays || []).some((day) => daySet.has(Number(day)));
      if (!overlapDay) return false;
      const existingProductIds = (promotion.promotion_products || []).map((row) => row.product_id);
      return existingProductIds.some((productId) => productIds.includes(productId));
    });
    return existing.length > 0;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      toast('Informe o nome da promocao.', 'error');
      return;
    }
    if (weekdays.length === 0) {
      toast('Selecione ao menos um dia da semana.', 'error');
      return;
    }
    if (scope === 'PRODUCT' && selectedProducts.length === 0) {
      toast('Selecione ao menos um produto.', 'error');
      return;
    }

    const normalizedDiscountValue =
      discountType === 'AMOUNT'
        ? parseCurrencyToCents(discountValue)
        : Math.max(0, Math.min(100, Number(discountValue.replace(',', '.')) || 0));

    if (normalizedDiscountValue <= 0) {
      toast('Informe um valor de desconto maior que zero.', 'error');
      return;
    }

    if (active && scope === 'PRODUCT' && hasConflict(editing?.id || null, selectedProducts, weekdays)) {
      toast('Ja existe promocao ativa para um dos produtos selecionados nos mesmos dias.', 'error');
      return;
    }

    setLoading(true);
    const payload = {
      name: normalizedName,
      scope,
      discount_type: discountType,
      discount_value: normalizedDiscountValue,
      weekdays,
      active,
      updated_at: new Date().toISOString(),
    };

    let promotionId = editing?.id || '';
    if (editing) {
      const { error } = await supabase.from('promotions').update(payload).eq('id', editing.id);
      if (error) {
        setLoading(false);
        toast(error.message, 'error');
        return;
      }
      promotionId = editing.id;
    } else {
      const { data, error } = await supabase.from('promotions').insert(payload).select('id').single();
      if (error || !data?.id) {
        setLoading(false);
        toast(error?.message || 'Falha ao criar promocao.', 'error');
        return;
      }
      promotionId = data.id;
    }

    if (scope === 'PRODUCT') {
      const { error: deleteError } = await supabase.from('promotion_products').delete().eq('promotion_id', promotionId);
      if (deleteError) {
        setLoading(false);
        toast(deleteError.message, 'error');
        return;
      }

      const rows = selectedProducts.map((productId) => ({ promotion_id: promotionId, product_id: productId }));
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('promotion_products').insert(rows);
        if (insertError) {
          setLoading(false);
          toast(insertError.message, 'error');
          return;
        }
      }
    } else {
      await supabase.from('promotion_products').delete().eq('promotion_id', promotionId);
    }

    setLoading(false);
    setShowModal(false);
    toast('Promocao salva.', 'success');
    load();
  };

  const toggleActive = async (promotion: PromotionRow) => {
    const nextValue = !promotion.active;
    if (
      nextValue &&
      promotion.scope === 'PRODUCT' &&
      hasConflict(promotion.id, (promotion.promotion_products || []).map((row) => row.product_id), (promotion.weekdays || []).map(Number))
    ) {
      toast('Conflito: ja existe outra promocao ativa para o mesmo produto e dia.', 'error');
      return;
    }
    const { error } = await supabase
      .from('promotions')
      .update({ active: nextValue, updated_at: new Date().toISOString() })
      .eq('id', promotion.id);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    load();
  };

  const remove = async (promotionId: string) => {
    const { error } = await supabase.from('promotions').delete().eq('id', promotionId);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Promocao excluida.', 'success');
    load();
  };

  const renderedPromotions = useMemo(() => promotions, [promotions]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-[28px] p-6 flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-gray-900">Promocoes</h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2">Descontos por produto ou global</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest"
        >
          Nova Promocao
        </button>
      </div>

      <div className="space-y-3">
        {renderedPromotions.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-400 font-black uppercase tracking-widest text-[10px]">
            Nenhuma promocao cadastrada
          </div>
        )}
        {renderedPromotions.map((promotion) => {
          const dayText = (promotion.weekdays || [])
            .map((day) => weekdaysLabel[Number(day)] || String(day))
            .join(', ');
          const selectedProductsCount = (promotion.promotion_products || []).length;
          const valueText =
            promotion.discount_type === 'AMOUNT'
              ? formatCurrency(Number(promotion.discount_value || 0))
              : `${Number(promotion.discount_value || 0)}%`;
          return (
            <div key={promotion.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-3 items-start">
                <div>
                  <p className="text-lg font-black text-gray-900">{promotion.name}</p>
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                    {promotion.scope === 'GLOBAL' ? 'Global' : `Por produto (${selectedProductsCount})`} • {promotion.discount_type === 'AMOUNT' ? 'Valor (R$)' : 'Percentual (%)'} • {valueText}
                  </p>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">{dayText}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${promotion.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {promotion.active ? 'Ativa' : 'Desativada'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => openEdit(promotion)}
                  className="py-2.5 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-700"
                >
                  Editar
                </button>
                <button
                  onClick={() => toggleActive(promotion)}
                  className="py-2.5 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-700"
                >
                  {promotion.active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => remove(promotion.id)}
                  className="py-2.5 rounded-xl border border-red-200 bg-red-50 text-[10px] font-black uppercase tracking-widest text-red-600"
                >
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <AppModal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editing ? 'Editar Promocao' : 'Nova Promocao'}
          size="lg"
          zIndex={230}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const form = document.getElementById('promotion-form') as HTMLFormElement | null;
                  form?.requestSubmit();
                }}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          }
        >
          <form id="promotion-form" onSubmit={save} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Nome da promocao</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 font-bold" />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Escopo</label>
                <CustomSelect
                  value={scope}
                  onChange={(nextValue) => setScope((nextValue as PromotionScope) || 'GLOBAL')}
                  options={[
                    { value: 'GLOBAL', label: 'Global (todos os produtos)' },
                    { value: 'PRODUCT', label: 'Por produto' },
                  ]}
                  buttonClassName="p-3 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Tipo de desconto</label>
                <CustomSelect
                  value={discountType}
                  onChange={(nextValue) => setDiscountType((nextValue as PromotionDiscountType) || 'PERCENT')}
                  options={[
                    { value: 'PERCENT', label: 'Percentual (%)' },
                    { value: 'AMOUNT', label: 'Valor fixo (R$)' },
                  ]}
                  buttonClassName="p-3 text-sm"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                  {discountType === 'AMOUNT' ? 'Valor (R$)' : 'Percentual (%)'}
                </label>
                <input
                  value={discountValue}
                  onChange={(e) => {
                    if (discountType === 'AMOUNT') {
                      setDiscountValue(formatCentsInput(parseCurrencyToCents(e.target.value)));
                      return;
                    }
                    const clean = e.target.value.replace(/[^\d.,]/g, '');
                    setDiscountValue(clean);
                  }}
                  className="w-full p-3 rounded-xl border border-gray-200 font-bold"
                  placeholder={discountType === 'AMOUNT' ? '0,00' : '10'}
                />
              </div>
              <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 cursor-pointer">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Status</p>
                  <p className="text-sm font-black text-gray-800">{active ? 'Ativa' : 'Desativada'}</p>
                </div>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Dias da semana</label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {allWeekdays.map((day) => {
                  const checked = weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setWeekdays((prev) =>
                          prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort()
                        )
                      }
                      className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                        checked ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {weekdaysLabel[day]}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setWeekdays([...allWeekdays])}
                className="text-[10px] font-black uppercase tracking-widest text-primary"
              >
                Marcar todos os dias
              </button>
            </div>

            {scope === 'PRODUCT' && (
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Produtos da promocao</label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
                  {products.map((product) => {
                    const checked = selectedProducts.includes(product.id);
                    return (
                      <label key={product.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 cursor-pointer">
                        <div>
                          <p className="text-sm font-black text-gray-800">{product.name}</p>
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{formatCurrency(product.price_cents)}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedProducts((prev) =>
                              event.target.checked
                                ? [...prev, product.id]
                                : prev.filter((item) => item !== product.id)
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        </AppModal>
      )}
    </div>
  );
};

export default AdminPromotions;

