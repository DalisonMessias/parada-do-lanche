import React, { useEffect, useMemo, useState } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { Category, Product, ProductAddon } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

type MenuTab = 'ALL' | string;

type AddonDraft = {
  id?: string;
  name: string;
  priceInput: string;
  markedDelete?: boolean;
};

const emptyAddonDraft = (): AddonDraft => ({ name: '', priceInput: '0,00' });

const centsToInput = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((cents || 0) / 100);

const inputToCents = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

const applyCurrencyMask = (value: string) => centsToInput(inputToCents(value));

const AdminMenu: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);

  const [activeTab, setActiveTab] = useState<MenuTab>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAddonsModal, setShowAddonsModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPriceInput, setProductPriceInput] = useState('0,00');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [productAddonMode, setProductAddonMode] = useState<'SINGLE' | 'MULTIPLE'>('MULTIPLE');
  const [productImageUrlInput, setProductImageUrlInput] = useState('');
  const [productImageUrlUploaded, setProductImageUrlUploaded] = useState('');
  const [productImageName, setProductImageName] = useState('');
  const [saveAndOpenAddons, setSaveAndOpenAddons] = useState(false);
  const [productAddonDrafts, setProductAddonDrafts] = useState<AddonDraft[]>([emptyAddonDraft()]);

  const addonsByProduct = useMemo(() => {
    const map = new Map<string, ProductAddon[]>();
    for (const addon of addons) {
      const list = map.get(addon.product_id) || [];
      list.push(addon);
      map.set(addon.product_id, list);
    }
    return map;
  }, [addons]);

  const search = searchTerm.trim().toLowerCase();

  const visibleCategories = useMemo(() => {
    const scoped = activeTab === 'ALL' ? categories : categories.filter((c) => c.id === activeTab);
    if (!search) return scoped;

    return scoped.filter((cat) => {
      const inCategoryName = cat.name.toLowerCase().includes(search);
      const inAnyProduct = products.some((p) => {
        if (p.category_id !== cat.id) return false;
        return `${p.name} ${p.description || ''}`.toLowerCase().includes(search);
      });
      return inCategoryName || inAnyProduct;
    });
  }, [activeTab, categories, products, search]);

  const resetProductForm = () => {
    setEditingProduct(null);
    setProductName('');
    setProductDescription('');
    setProductPriceInput('0,00');
    setProductCategoryId(categories[0]?.id || '');
    setProductAddonMode('MULTIPLE');
    setProductImageUrlInput('');
    setProductImageUrlUploaded('');
    setProductImageName('');
    setProductAddonDrafts([emptyAddonDraft()]);
    setSaveAndOpenAddons(false);
  };

  const fetchData = async () => {
    const [catRes, prodRes, addonRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*').order('name'),
      supabase.from('product_addons').select('*').order('name'),
    ]);

    if (catRes.error) toast(`Falha ao carregar categorias: ${catRes.error.message}`, 'error');
    if (prodRes.error) toast(`Falha ao carregar produtos: ${prodRes.error.message}`, 'error');
    if (addonRes.error) toast(`Falha ao carregar adicionais: ${addonRes.error.message}`, 'error');

    if (catRes.data) setCategories(catRes.data as Category[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (addonRes.data) setAddons(addonRes.data as ProductAddon[]);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!showProductModal) return;
    if (!editingProduct && !productCategoryId && categories[0]?.id) {
      setProductCategoryId(categories[0].id);
    }
  }, [showProductModal, editingProduct, productCategoryId, categories]);

  useEffect(() => {
    if (activeTab !== 'ALL' && !categories.some((c) => c.id === activeTab)) {
      setActiveTab('ALL');
    }
  }, [activeTab, categories]);

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryNameInput('');
    setShowCategoryModal(true);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryNameInput(category.name);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = categoryNameInput.trim();
    if (!name) return;
    setLoading(true);

    if (editingCategory) {
      const { error } = await supabase.from('categories').update({ name }).eq('id', editingCategory.id);
      if (error) toast(error.message, 'error');
      else {
        toast('Categoria atualizada.', 'success');
        setShowCategoryModal(false);
        fetchData();
      }
    } else {
      const { error } = await supabase.from('categories').insert({ name, sort_order: categories.length + 1 });
      if (error) toast(error.message, 'error');
      else {
        toast('Categoria criada.', 'success');
        setShowCategoryModal(false);
        fetchData();
      }
    }

    setLoading(false);
  };

  const handleDeleteCategory = async (category: Category) => {
    const ok = await confirm(`Excluir categoria "${category.name}"? Os produtos vinculados tambem serao removidos.`);
    if (!ok) return;
    const { error } = await supabase.from('categories').delete().eq('id', category.id);
    if (error) toast(`Erro ao excluir categoria: ${error.message}`, 'error');
    else {
      toast('Categoria removida.', 'success');
      fetchData();
    }
  };

  const openCreateProduct = () => {
    resetProductForm();
    setShowProductModal(true);
  };

  const openEditProduct = (product: Product) => {
    const productAddons = addonsByProduct.get(product.id) || [];
    setEditingProduct(product);
    setProductName(product.name);
    setProductDescription(product.description || '');
    setProductPriceInput(centsToInput(product.price_cents));
    setProductCategoryId(product.category_id);
    setProductAddonMode(product.addon_selection_mode || 'MULTIPLE');
    setProductImageUrlInput(product.image_url || '');
    setProductImageUrlUploaded('');
    setProductImageName('');
    setProductAddonDrafts(
      productAddons.length
        ? productAddons.map((a) => ({ id: a.id, name: a.name, priceInput: centsToInput(a.price_cents), markedDelete: false }))
        : [emptyAddonDraft()]
    );
    setSaveAndOpenAddons(false);
    setShowProductModal(true);
  };

  const handleUploadProductImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingImage(true);
      if (!event.target.files || event.target.files.length === 0) return;
      const file = event.target.files[0];
      setProductImageName(file.name);
      const fileExt = file.name.split('.').pop();
      const filePath = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('assets').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('assets').getPublicUrl(filePath);
      setProductImageUrlUploaded(data.publicUrl);
      toast('Foto enviada com sucesso.', 'success');
    } catch (error: any) {
      toast(`Erro no upload da foto: ${error.message}`, 'error');
    } finally {
      setUploadingImage(false);
    }
  };
  const addAddonDraft = () => setProductAddonDrafts((prev) => [...prev, emptyAddonDraft()]);

  const removeAddonDraft = (index: number) => {
    setProductAddonDrafts((prev) => {
      const current = prev[index];
      if (current?.id) {
        const copy = [...prev];
        copy[index] = { ...copy[index], markedDelete: !copy[index].markedDelete };
        return copy;
      }
      if (prev.length === 1) return [emptyAddonDraft()];
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateAddonDraft = (index: number, patch: Partial<AddonDraft>) => {
    setProductAddonDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const persistProductAddons = async (productId: string) => {
    const toDelete = productAddonDrafts.filter((a) => a.id && a.markedDelete).map((a) => a.id as string);
    const toUpdate = productAddonDrafts.filter((a) => a.id && !a.markedDelete && a.name.trim());
    const toCreate = productAddonDrafts.filter((a) => !a.id && a.name.trim());

    if (toDelete.length) {
      const { error } = await supabase.from('product_addons').delete().in('id', toDelete);
      if (error) throw new Error(`Falha ao remover adicionais: ${error.message}`);
    }

    for (const addon of toUpdate) {
      const { error } = await supabase
        .from('product_addons')
        .update({ name: addon.name.trim(), price_cents: inputToCents(addon.priceInput), active: true })
        .eq('id', addon.id as string);
      if (error) throw new Error(`Falha ao atualizar adicional "${addon.name}": ${error.message}`);
    }

    if (toCreate.length) {
      const rows = toCreate.map((addon) => ({
        product_id: productId,
        name: addon.name.trim(),
        price_cents: inputToCents(addon.priceInput),
        active: true,
      }));
      const { error } = await supabase.from('product_addons').insert(rows);
      if (error) throw new Error(`Falha ao criar adicionais: ${error.message}`);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!productName.trim() || !productCategoryId) return;

    setLoading(true);
    try {
      const payload = {
        name: productName.trim(),
        description: productDescription.trim(),
        price_cents: inputToCents(productPriceInput),
        category_id: productCategoryId,
        image_url: productImageUrlUploaded || productImageUrlInput.trim() || '',
        addon_selection_mode: productAddonMode,
        active: editingProduct ? editingProduct.active : true,
      };

      let productId = editingProduct?.id || '';
      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        productId = data.id;
      }

      await persistProductAddons(productId);

      toast(editingProduct ? 'Produto atualizado.' : 'Produto criado.', 'success');
      setShowProductModal(false);
      await fetchData();

      if (saveAndOpenAddons) {
        const targetProduct = products.find((p) => p.id === productId) || editingProduct || null;
        if (targetProduct) {
          setSelectedProduct(targetProduct);
          setShowAddonsModal(true);
        }
      }
    } catch (error: any) {
      toast(`Erro ao salvar produto: ${error.message}`, 'error');
    } finally {
      setLoading(false);
      setSaveAndOpenAddons(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    const ok = await confirm(`Deseja excluir o produto "${product.name}"?`);
    if (!ok) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) toast(`Erro ao remover produto: ${error.message}`, 'error');
    else {
      toast('Produto removido.', 'success');
      fetchData();
    }
  };

  const handleToggleProduct = async (id: string, current: boolean) => {
    const { error } = await supabase.from('products').update({ active: !current }).eq('id', id);
    if (error) toast(`Falha ao atualizar status: ${error.message}`, 'error');
    else fetchData();
  };

  const openAddonsModal = (product: Product) => {
    setSelectedProduct(product);
    setShowAddonsModal(true);
  };

  const handleDeleteAddonFromList = async (addon: ProductAddon) => {
    const ok = await confirm(`Remover adicional "${addon.name}"?`);
    if (!ok) return;
    const { error } = await supabase.from('product_addons').delete().eq('id', addon.id);
    if (error) toast(`Erro ao remover adicional: ${error.message}`, 'error');
    else {
      toast('Adicional removido.', 'success');
      fetchData();
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[28px] border border-gray-200 space-y-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Gerenciar Cardapio</h2>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">
              Categorias em abas, busca por texto e CRUD completo
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={openCreateCategory}
              className="bg-gray-50 text-gray-500 border border-gray-200 px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all active:scale-95"
            >
              + Categoria
            </button>
            <button
              onClick={openCreateProduct}
              className="bg-primary text-white px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-transform active:scale-95"
            >
              + Produto
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Busca por categoria, produto ou descricao</label>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ex: hamburguer, bebidas, batata..."
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              activeTab === 'ALL' ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                activeTab === cat.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>
      {showCategoryModal && (
        <div className="fixed inset-0 z-[110] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-6">
          <form onSubmit={handleSaveCategory} className="bg-white w-full max-w-md rounded-[32px] p-10 space-y-8 border border-gray-200">
            <h3 className="text-2xl font-black uppercase tracking-tighter italic text-gray-900">
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome da Categoria</label>
              <input
                value={categoryNameInput}
                onChange={(e) => setCategoryNameInput(e.target.value)}
                placeholder="Ex: Bebidas"
                required
                className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCategoryModal(false)} className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {showProductModal && (
        <div className="fixed inset-0 z-[110] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto">
          <form onSubmit={handleSaveProduct} className="bg-white w-full max-w-4xl rounded-[40px] p-10 space-y-8 border border-gray-200">
            <h3 className="text-3xl font-black uppercase tracking-tighter italic text-gray-900">
              {editingProduct ? 'Editar Produto' : 'Novo Produto'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Item</label>
                  <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ex: Hamburguer" required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Descricao</label>
                  <textarea value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Ingredientes..." className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary h-28" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoria</label>
                  <select value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)} required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary appearance-none">
                    <option value="">Selecione...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Modo de adicionais</label>
                  <select value={productAddonMode} onChange={(e) => setProductAddonMode(e.target.value as 'SINGLE' | 'MULTIPLE')} className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary">
                    <option value="SINGLE">Selecionar apenas 1 adicional</option>
                    <option value="MULTIPLE">Selecionar multiplos adicionais</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Preco (BRL)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">R$</span>
                    <input
                      value={productPriceInput}
                      onChange={(e) => setProductPriceInput(applyCurrencyMask(e.target.value))}
                      inputMode="numeric"
                      placeholder="0,00"
                      required
                      className="w-full pl-12 p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Foto do Produto</label>
                  <div className="rounded-2xl border border-dashed border-gray-300 p-4 space-y-3 bg-gray-50">
                    <input id="product-photo-upload" type="file" accept="image/*" onChange={handleUploadProductImage} disabled={uploadingImage} className="hidden" />
                    <label htmlFor="product-photo-upload" className="w-full inline-flex items-center justify-center px-4 py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest cursor-pointer">
                      Escolher Foto
                    </label>
                    <span className="block text-[10px] font-black text-gray-400 truncate text-center">
                      {productImageName || 'Nenhum arquivo selecionado'}
                    </span>
                    {(productImageUrlUploaded || productImageUrlInput) && (
                      <img src={productImageUrlUploaded || productImageUrlInput} className="w-full h-32 object-cover rounded-xl border border-gray-200" />
                    )}
                    <input value={productImageUrlInput} onChange={(e) => setProductImageUrlInput(e.target.value)} placeholder="Ou cole a URL da imagem" className="w-full p-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t border-gray-100 pt-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black uppercase tracking-widest text-gray-700">Adicionais do Produto</h4>
                <button type="button" onClick={addAddonDraft} className="px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-700">
                  + Novo Campo
                </button>
              </div>
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {productAddonDrafts.map((addon, index) => (
                  <div key={`${addon.id || 'new'}-${index}`} className={`grid grid-cols-12 gap-2 border rounded-xl p-3 ${addon.markedDelete ? 'bg-red-50 border-red-200 opacity-70' : 'bg-white border-gray-200'}`}>
                    <input
                      value={addon.name}
                      onChange={(e) => updateAddonDraft(index, { name: e.target.value })}
                      placeholder="Nome do adicional"
                      disabled={addon.markedDelete}
                      className="col-span-6 p-3 bg-white border border-gray-200 rounded-lg font-black outline-none focus:border-primary"
                    />
                    <div className="col-span-4 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xs">R$</span>
                      <input
                        value={addon.priceInput}
                        onChange={(e) => updateAddonDraft(index, { priceInput: applyCurrencyMask(e.target.value) })}
                        inputMode="numeric"
                        placeholder="0,00"
                        disabled={addon.markedDelete}
                        className="w-full pl-10 p-3 bg-white border border-gray-200 rounded-lg font-black outline-none focus:border-primary"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAddonDraft(index)}
                      className={`col-span-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                        addon.id
                          ? addon.markedDelete
                            ? 'bg-gray-100 text-gray-600 border border-gray-200'
                            : 'bg-red-50 text-red-500 border border-red-200'
                          : 'bg-red-50 text-red-500 border border-red-200'
                      }`}
                    >
                      {addon.id ? (addon.markedDelete ? 'Desfazer' : 'Excluir') : 'Remover'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4 border-t border-gray-100 pt-8">
              <button type="button" onClick={() => setShowProductModal(false)} className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]">
                Cancelar
              </button>
              <button type="submit" onClick={() => setSaveAndOpenAddons(true)} disabled={loading || uploadingImage} className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-xl font-black uppercase tracking-widest text-[10px] border border-gray-200">
                Salvar e Adicionais
              </button>
              <button type="submit" onClick={() => setSaveAndOpenAddons(false)} disabled={loading || uploadingImage} className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
      {showAddonsModal && selectedProduct && (
        <div className="fixed inset-0 z-[120] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[32px] p-8 space-y-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900">Adicionais Avulsos</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">{selectedProduct.name}</p>
              </div>
              <button onClick={() => setShowAddonsModal(false)} className="text-gray-400 font-black">Fechar</button>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {(addonsByProduct.get(selectedProduct.id) || []).length === 0 && (
                <p className="text-sm text-gray-400 font-bold">Nenhum adicional cadastrado.</p>
              )}
              {(addonsByProduct.get(selectedProduct.id) || []).map((addon) => (
                <div key={addon.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                  <div>
                    <p className="font-black text-gray-800">{addon.name}</p>
                    <p className="text-xs text-primary font-black">+ {formatCurrency(addon.price_cents)}</p>
                  </div>
                  <button onClick={() => handleDeleteAddonFromList(addon)} className="text-[10px] font-black uppercase text-red-400">
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {visibleCategories.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-[24px] p-12 text-center">
          <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest">
            Nenhum resultado para a busca atual.
          </p>
        </div>
      ) : (
        visibleCategories.map((cat) => {
          const categoryProducts = products.filter((p) => {
            if (p.category_id !== cat.id) return false;
            if (!search) return true;
            return `${p.name} ${p.description || ''}`.toLowerCase().includes(search) || cat.name.toLowerCase().includes(search);
          });

          if (!categoryProducts.length) return null;

          return (
            <div key={cat.id} className="space-y-6">
              <div className="flex flex-wrap gap-2 justify-between items-center border-b border-gray-200 pb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-black text-gray-900 uppercase tracking-tighter text-2xl italic">{cat.name}</h3>
                  <span className="text-[9px] bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full text-gray-400 font-black tracking-widest uppercase italic">
                    {categoryProducts.length} itens
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEditCategory(cat)} className="px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-600">
                    Editar Categoria
                  </button>
                  <button onClick={() => handleDeleteCategory(cat)} className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[10px] font-black uppercase tracking-widest text-red-500">
                    Excluir Categoria
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {categoryProducts.map((product) => {
                  const productAddons = addonsByProduct.get(product.id) || [];
                  return (
                    <div key={product.id} className="bg-white border border-gray-200 rounded-[28px] p-5 flex flex-col gap-4 group hover:border-primary/20 transition-all">
                      {(product.image_url || '').trim() ? (
                        <img src={product.image_url} className="w-full aspect-video rounded-2xl object-cover bg-gray-50 border border-gray-50" />
                      ) : (
                        <div className="w-full aspect-video rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                          <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">Sem imagem</span>
                        </div>
                      )}
                      <div className="flex-1 py-1 space-y-1">
                        <h4 className="font-black text-gray-900 text-lg leading-tight truncate">{product.name}</h4>
                        <p className="text-primary font-black text-xl tracking-tighter italic">{formatCurrency(product.price_cents)}</p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">
                          adicionais: {productAddons.length} | modo: {product.addon_selection_mode === 'SINGLE' ? '1 opcao' : 'multiplos'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-4">
                        <button
                          onClick={() => handleToggleProduct(product.id, product.active)}
                          className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${
                            product.active ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'
                          }`}
                        >
                          {product.active ? 'Ativo' : 'Inativo'}
                        </button>
                        <button onClick={() => openAddonsModal(product)} className="py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border border-gray-200 text-gray-600 bg-gray-50">
                          Adicionais
                        </button>
                        <button onClick={() => openEditProduct(product)} className="py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest border border-gray-200 text-gray-700 bg-gray-100">
                          Editar Produto
                        </button>
                        <button onClick={() => handleDeleteProduct(product)} className="py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest border border-red-100 text-red-400 bg-red-50">
                          Excluir Produto
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default AdminMenu;
