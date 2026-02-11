import React, { useEffect, useMemo, useState } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { Category, Product, ProductAddon } from '../types';

const AdminMenu: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [showAddProd, setShowAddProd] = useState(false);
  const [showAddonsModal, setShowAddonsModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState('0');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);

  const addonsByProduct = useMemo(() => {
    const map = new Map<string, ProductAddon[]>();
    for (const addon of addons) {
      const list = map.get(addon.product_id) || [];
      list.push(addon);
      map.set(addon.product_id, list);
    }
    return map;
  }, [addons]);

  const fetchData = async () => {
    const [catRes, prodRes, addonRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*').order('name'),
      supabase.from('product_addons').select('*').order('name'),
    ]);

    if (catRes.data) setCategories(catRes.data as Category[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (addonRes.data) setAddons(addonRes.data as ProductAddon[]);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!showAddProd) {
      setProductImageUrl('');
      setUploadingImage(false);
    }
  }, [showAddProd]);

  const handleUploadProductImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingImage(true);
      if (!event.target.files || event.target.files.length === 0) return;
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('assets').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('assets').getPublicUrl(filePath);
      setProductImageUrl(data.publicUrl);
    } catch (error: any) {
      alert('Erro no upload da foto: ' + error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = String(formData.get('catName') || '').trim();

    const { error } = await supabase.from('categories').insert({
      name,
      sort_order: categories.length + 1,
    });

    if (error) alert(error.message);
    else {
      setShowAddCat(false);
      fetchData();
    }
    setLoading(false);
  };

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const newProduct = {
      name: String(formData.get('name') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      price_cents: Math.round(parseFloat(String(formData.get('price') || '0')) * 100),
      category_id: String(formData.get('category_id') || ''),
      image_url: productImageUrl || String(formData.get('image_url') || '').trim() || 'https://picsum.photos/seed/food/400/300',
      addon_selection_mode: String(formData.get('addon_selection_mode') || 'MULTIPLE'),
      active: true,
    };

    const { error } = await supabase.from('products').insert(newProduct);

    if (error) alert(error.message);
    else {
      setShowAddProd(false);
      setProductImageUrl('');
      fetchData();
    }
    setLoading(false);
  };

  const handleAddAddon = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const name = newAddonName.trim();
    const price = Math.round(parseFloat(newAddonPrice || '0') * 100);
    if (!name) return;

    setLoading(true);
    const { error } = await supabase.from('product_addons').insert({
      product_id: selectedProduct.id,
      name,
      price_cents: price,
      active: true,
    });

    setLoading(false);
    if (error) {
      alert('Erro ao criar adicional: ' + error.message);
      return;
    }

    setNewAddonName('');
    setNewAddonPrice('0');
    fetchData();
  };

  const handleDeleteAddon = async (addonId: string) => {
    if (!confirm('Remover este adicional?')) return;
    const { error } = await supabase.from('product_addons').delete().eq('id', addonId);
    if (error) alert('Erro ao remover adicional: ' + error.message);
    else fetchData();
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Deseja excluir este produto permanentemente?')) return;
    await supabase.from('products').delete().eq('id', id);
    fetchData();
  };

  const handleToggleProduct = async (id: string, current: boolean) => {
    await supabase.from('products').update({ active: !current }).eq('id', id);
    fetchData();
  };

  const openAddonsModal = (product: Product) => {
    setSelectedProduct(product);
    setShowAddonsModal(true);
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center bg-white p-8 rounded-[28px] border border-gray-200">
        <div>
          <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Gerenciar Cardapio</h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">Controle total sobre produtos, fotos e adicionais</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddCat(true)}
            className="bg-gray-50 text-gray-500 border border-gray-200 px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all active:scale-95"
          >
            + Categoria
          </button>
          <button
            onClick={() => setShowAddProd(true)}
            className="bg-primary text-white px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-transform active:scale-95"
          >
            + Produto
          </button>
        </div>
      </div>

      {showAddCat && (
        <div className="fixed inset-0 z-[110] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-6">
          <form onSubmit={handleAddCategory} className="bg-white w-full max-w-md rounded-[32px] p-10 space-y-8 animate-in zoom-in-95 border border-gray-200">
            <h3 className="text-2xl font-black uppercase tracking-tighter italic text-gray-900">Nova Categoria</h3>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome da Categoria</label>
              <input name="catName" placeholder="Ex: Bebidas" required className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAddCat(false)} className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]">Cancelar</button>
              <button type="submit" disabled={loading} className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">Criar Agora</button>
            </div>
          </form>
        </div>
      )}

      {showAddProd && (
        <div className="fixed inset-0 z-[110] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto">
          <form onSubmit={handleAddProduct} className="bg-white w-full max-w-2xl rounded-[40px] p-10 space-y-8 animate-in zoom-in-95 border border-gray-200">
            <h3 className="text-2xl font-black uppercase tracking-tighter italic text-gray-900">Novo Produto</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Item</label>
                  <input name="name" placeholder="Ex: Hamburguer" required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Descricao</label>
                  <textarea name="description" placeholder="Ingredientes..." className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary h-24" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Modo de adicionais</label>
                  <select name="addon_selection_mode" defaultValue="MULTIPLE" className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary">
                    <option value="SINGLE">Selecionar apenas 1 adicional</option>
                    <option value="MULTIPLE">Selecionar multiplos adicionais</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Preco (BRL)</label>
                  <input name="price" type="number" step="0.01" placeholder="0,00" required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoria</label>
                  <select name="category_id" required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary appearance-none">
                    <option value="">Selecione...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Foto do Produto</label>
                  <div className="rounded-2xl border border-dashed border-gray-300 p-4 space-y-3 bg-gray-50">
                    <input type="file" accept="image/*" onChange={handleUploadProductImage} disabled={uploadingImage} className="w-full text-xs font-black" />
                    {productImageUrl && (
                      <img src={productImageUrl} className="w-full h-28 object-cover rounded-xl border border-gray-200" />
                    )}
                    <input name="image_url" placeholder="Ou cole a URL da imagem" className="w-full p-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
                    {uploadingImage && <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Enviando imagem...</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 border-t border-gray-100 pt-8">
              <button type="button" onClick={() => setShowAddProd(false)} className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]">Descartar</button>
              <button type="submit" disabled={loading || uploadingImage} className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">Salvar Item</button>
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

            <form onSubmit={handleAddAddon} className="grid md:grid-cols-[1fr_180px_auto] gap-3">
              <input value={newAddonName} onChange={(e) => setNewAddonName(e.target.value)} placeholder="Nome do adicional" required className="w-full p-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
              <input value={newAddonPrice} onChange={(e) => setNewAddonPrice(e.target.value)} type="number" step="0.01" placeholder="0,00" required className="w-full p-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
              <button type="submit" disabled={loading} className="px-4 bg-gray-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest">Adicionar</button>
            </form>

            <div className="space-y-2">
              {(addonsByProduct.get(selectedProduct.id) || []).length === 0 && (
                <p className="text-sm text-gray-400 font-bold">Nenhum adicional cadastrado.</p>
              )}
              {(addonsByProduct.get(selectedProduct.id) || []).map((addon) => (
                <div key={addon.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                  <div>
                    <p className="font-black text-gray-800">{addon.name}</p>
                    <p className="text-xs text-primary font-black">+ {formatCurrency(addon.price_cents)}</p>
                  </div>
                  <button onClick={() => handleDeleteAddon(addon.id)} className="text-[10px] font-black uppercase text-red-400">Remover</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat.id} className="space-y-6">
          <div className="flex justify-between items-center border-b border-gray-200 pb-4">
            <h3 className="font-black text-gray-900 uppercase tracking-tighter text-2xl italic">{cat.name}</h3>
            <span className="text-[9px] bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full text-gray-400 font-black tracking-widest uppercase italic">
              {products.filter((p) => p.category_id === cat.id).length} itens ativos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.filter((p) => p.category_id === cat.id).map((product) => {
              const productAddons = addonsByProduct.get(product.id) || [];
              return (
                <div key={product.id} className="bg-white border border-gray-200 rounded-[28px] p-5 flex flex-col gap-4 group hover:border-primary/20 transition-all">
                  <img src={product.image_url} className="w-full aspect-video rounded-2xl object-cover bg-gray-50 border border-gray-50" />
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
                    <button
                      onClick={() => openAddonsModal(product)}
                      className="py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border border-gray-200 text-gray-600 bg-gray-50"
                    >
                      Adicionais
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="col-span-2 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest border border-red-100 text-red-400 bg-red-50"
                    >
                      Remover Produto
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AdminMenu;
