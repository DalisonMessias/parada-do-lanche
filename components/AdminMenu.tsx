
import React, { useState, useEffect } from 'react';
import { supabase, formatCurrency } from '../services/supabase';
import { Category, Product } from '../types';

const AdminMenu: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [showAddProd, setShowAddProd] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    const { data: catData } = await supabase.from('categories').select('*').order('sort_order');
    const { data: prodData } = await supabase.from('products').select('*').order('name');
    if (catData) setCategories(catData);
    if (prodData) setProducts(prodData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get('catName') as string;
    
    const { error } = await supabase.from('categories').insert({ 
      name, 
      sort_order: categories.length + 1 
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
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price_cents: Math.round(parseFloat(formData.get('price') as string) * 100),
      category_id: formData.get('category_id') as string,
      image_url: formData.get('image_url') as string || 'https://picsum.photos/seed/food/400/300',
      active: true
    };

    const { error } = await supabase.from('products').insert(newProduct);

    if (error) alert(error.message);
    else {
      setShowAddProd(false);
      fetchData();
    }
    setLoading(false);
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

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center bg-white p-8 rounded-[28px] border border-gray-200">
        <div>
          <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Gerenciar Cardápio</h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">Controle total sobre produtos e categorias</p>
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
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">NOME DA CATEGORIA</label>
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
          <form onSubmit={handleAddProduct} className="bg-white w-full max-w-xl rounded-[40px] p-10 space-y-10 animate-in zoom-in-95 border border-gray-200">
            <h3 className="text-2xl font-black uppercase tracking-tighter italic text-gray-900">Novo Produto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">NOME DO ITEM</label>
                  <input name="name" placeholder="Ex: Hamburguer" required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">DESCRIÇÃO</label>
                  <textarea name="description" placeholder="Ingredientes..." className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary h-24" />
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">PREÇO (BRL)</label>
                  <input name="price" type="number" step="0.01" placeholder="0,00" required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">CATEGORIA</label>
                  <select name="category_id" required className="w-full p-4 bg-white border border-gray-200 rounded-xl font-black outline-none focus:border-primary appearance-none">
                    <option value="">Selecione...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-4 border-t border-gray-100 pt-8">
              <button type="button" onClick={() => setShowAddProd(false)} className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]">Descartar</button>
              <button type="submit" disabled={loading} className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">Salvar Item</button>
            </div>
          </form>
        </div>
      )}

      {categories.map(cat => (
        <div key={cat.id} className="space-y-6">
          <div className="flex justify-between items-center border-b border-gray-200 pb-4">
            <h3 className="font-black text-gray-900 uppercase tracking-tighter text-2xl italic">{cat.name}</h3>
            <span className="text-[9px] bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full text-gray-400 font-black tracking-widest uppercase italic">
              {products.filter(p => p.category_id === cat.id).length} itens ativos
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.filter(p => p.category_id === cat.id).map(product => (
              <div key={product.id} className="bg-white border border-gray-200 rounded-[28px] p-5 flex flex-col gap-4 group hover:border-primary/20 transition-all">
                <img src={product.image_url} className="w-full aspect-video rounded-2xl object-cover bg-gray-50 border border-gray-50" />
                <div className="flex-1 py-1">
                  <h4 className="font-black text-gray-900 text-lg leading-tight truncate">{product.name}</h4>
                  <p className="text-primary font-black text-xl mt-1.5 tracking-tighter italic">{formatCurrency(product.price_cents)}</p>
                </div>
                <div className="flex gap-2 border-t border-gray-100 pt-4">
                  <button 
                    onClick={() => handleToggleProduct(product.id, product.active)}
                    className={`flex-1 py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${
                      product.active ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'
                    }`}
                  >
                    {product.active ? 'Status: Ativo' : 'Status: Inativo'}
                  </button>
                  <button 
                    onClick={() => handleDeleteProduct(product.id)}
                    className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AdminMenu;
