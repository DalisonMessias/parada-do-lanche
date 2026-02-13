
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { StoreSettings, Profile } from '../types';

interface AdminSettingsProps {
  settings: StoreSettings | null;
  onUpdate: () => void;
  profile: Profile | null;
}

const AdminSettings: React.FC<AdminSettingsProps> = ({ settings, onUpdate, profile }) => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    store_name: '',
    primary_color: '#f97316',
    logo_url: '',
    order_approval_mode: 'HOST' as 'HOST' | 'SELF',
    enable_counter_module: true,
    default_delivery_fee_cents: 0,
    sticker_bg_color: '#ffffff',
    sticker_text_color: '#111827',
    sticker_border_color: '#111111',
    sticker_muted_text_color: '#9ca3af',
    sticker_qr_frame_color: '#111111'
  });

  const isAdmin = profile?.role === 'ADMIN';

  useEffect(() => {
    if (settings) {
      setFormData({
        store_name: settings.store_name,
        primary_color: settings.primary_color,
        logo_url: settings.logo_url || '',
        order_approval_mode: (settings.order_approval_mode || 'HOST') as 'HOST' | 'SELF',
        enable_counter_module: settings.enable_counter_module !== false,
        default_delivery_fee_cents: Number(settings.default_delivery_fee_cents || 0),
        sticker_bg_color: settings.sticker_bg_color || '#ffffff',
        sticker_text_color: settings.sticker_text_color || '#111827',
        sticker_border_color: settings.sticker_border_color || '#111111',
        sticker_muted_text_color: settings.sticker_muted_text_color || '#9ca3af',
        sticker_qr_frame_color: settings.sticker_qr_frame_color || '#111111'
      });
    }
  }, [settings]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('assets').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('assets').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, logo_url: data.publicUrl }));
    } catch (error: any) {
      alert("Erro no upload: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);
    const { error } = await supabase.from('settings').upsert({ id: 1, ...formData });
    if (error) alert("Erro ao salvar: " + error.message);
    else { onUpdate(); alert("Configurações atualizadas!"); }
    setLoading(false);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-8">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center mx-auto text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900 leading-none">Acesso Restrito</h2>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-3">Apenas administradores podem gerenciar a marca.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="bg-white p-10 rounded-[32px] border border-gray-200 space-y-10">
        <div className="flex items-center justify-between border-b border-gray-100 pb-8">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-gray-900">Configuracoes</h2>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">Parametros gerais da loja e identidade visual</p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">NOME DA LOJA</label>
              <input value={formData.store_name} onChange={e => setFormData({...formData, store_name: e.target.value})} className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black" placeholder="Ex: Parada do Lanche" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">COR DE MARCA (HEX)</label>
              <div className="flex gap-4 items-center">
                <input type="color" value={formData.primary_color} onChange={e => setFormData({...formData, primary_color: e.target.value})} className="w-14 h-14 rounded-xl border border-gray-200 p-1 cursor-pointer bg-white" />
                <input value={formData.primary_color} onChange={e => setFormData({...formData, primary_color: e.target.value})} className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-mono font-black" />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">MODO DE ACEITE DA MESA</label>
              <select
                value={formData.order_approval_mode}
                onChange={e => setFormData({ ...formData, order_approval_mode: e.target.value as 'HOST' | 'SELF' })}
                className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black appearance-none"
              >
                <option value="HOST">Responsavel da mesa aprova tudo (recomendado)</option>
                <option value="SELF">Cada pessoa aprova o proprio pedido</option>
              </select>
            </div>
            <div className="space-y-3 md:col-span-2 rounded-2xl border border-gray-100 p-4 bg-gray-50">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Modulo Balcao</p>
              <label className="flex items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-sm font-black text-gray-800">Habilitar modulo Balcao</p>
                  <p className="text-[10px] text-gray-500 font-bold">Permite pedidos de balcao para qualquer usuario logado.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.enable_counter_module}
                  onChange={(e) => setFormData({ ...formData, enable_counter_module: e.target.checked })}
                  className="w-5 h-5 accent-primary"
                />
              </label>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Taxa de entrega padrao (R$)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={(Math.max(0, Number(formData.default_delivery_fee_cents || 0)) / 100).toString()}
                onChange={(e) => {
                  const value = Number(e.target.value || 0);
                  const cents = Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
                  setFormData({ ...formData, default_delivery_fee_cents: cents });
                }}
                className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                placeholder="0.00"
              />
              <p className="text-[10px] text-gray-500 font-bold">Usada como valor inicial em pedidos de entrega no Balcao.</p>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-gray-50">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">LOGOTIPO OFICIAL</label>
            <div className="grid md:grid-cols-12 gap-10 items-start">
              <div className="md:col-span-4 relative group aspect-square">
                <div className="w-full h-full bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-4 hover:bg-gray-100 transition-all cursor-pointer overflow-hidden relative">
                  {formData.logo_url ? <img src={formData.logo_url} className="w-full h-full object-contain p-6" /> : <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploading} />
                  {uploading && <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center"><div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin"></div></div>}
                </div>
              </div>

              <div className="md:col-span-8 flex flex-col justify-center h-full space-y-6">
                <div className="p-6 bg-gray-50/50 border border-gray-100 rounded-[24px]">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-tight leading-loose italic">
                    Utilize arquivos transparentes (PNG/SVG) para garantir que a marca se integre perfeitamente à interface clara.
                  </p>
                </div>
                {formData.logo_url && (
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))} className="flex items-center gap-2 text-red-400 hover:text-red-600 font-black text-[9px] uppercase tracking-widest transition-colors italic">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    Descartar Imagem
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-8 border-t border-gray-100">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tighter text-gray-900">Personalizacao do Adesivo</h3>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">Controle cores do QR da mesa</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Fundo do adesivo</label>
                <div className="flex gap-4 items-center">
                  <input type="color" value={formData.sticker_bg_color} onChange={e => setFormData({...formData, sticker_bg_color: e.target.value})} className="w-14 h-14 rounded-xl border border-gray-200 p-1 cursor-pointer bg-white" />
                  <input value={formData.sticker_bg_color} onChange={e => setFormData({...formData, sticker_bg_color: e.target.value})} className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-mono font-black" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Texto principal</label>
                <div className="flex gap-4 items-center">
                  <input type="color" value={formData.sticker_text_color} onChange={e => setFormData({...formData, sticker_text_color: e.target.value})} className="w-14 h-14 rounded-xl border border-gray-200 p-1 cursor-pointer bg-white" />
                  <input value={formData.sticker_text_color} onChange={e => setFormData({...formData, sticker_text_color: e.target.value})} className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-mono font-black" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Borda do adesivo</label>
                <div className="flex gap-4 items-center">
                  <input type="color" value={formData.sticker_border_color} onChange={e => setFormData({...formData, sticker_border_color: e.target.value})} className="w-14 h-14 rounded-xl border border-gray-200 p-1 cursor-pointer bg-white" />
                  <input value={formData.sticker_border_color} onChange={e => setFormData({...formData, sticker_border_color: e.target.value})} className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-mono font-black" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Texto secundario</label>
                <div className="flex gap-4 items-center">
                  <input type="color" value={formData.sticker_muted_text_color} onChange={e => setFormData({...formData, sticker_muted_text_color: e.target.value})} className="w-14 h-14 rounded-xl border border-gray-200 p-1 cursor-pointer bg-white" />
                  <input value={formData.sticker_muted_text_color} onChange={e => setFormData({...formData, sticker_muted_text_color: e.target.value})} className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-mono font-black" />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Borda do QR principal</label>
                <div className="flex gap-4 items-center">
                  <input type="color" value={formData.sticker_qr_frame_color} onChange={e => setFormData({...formData, sticker_qr_frame_color: e.target.value})} className="w-14 h-14 rounded-xl border border-gray-200 p-1 cursor-pointer bg-white" />
                  <input value={formData.sticker_qr_frame_color} onChange={e => setFormData({...formData, sticker_qr_frame_color: e.target.value})} className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-mono font-black" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6" style={{ backgroundColor: formData.sticker_bg_color }}>
              <div className="rounded-xl border-2 p-4 text-center" style={{ borderColor: formData.sticker_border_color }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: formData.sticker_text_color }}>Preview da Mesa</p>
                <p className="text-3xl font-black italic mt-2" style={{ color: formData.sticker_text_color }}>MESA 01</p>
                <div className="w-16 h-16 mx-auto mt-4 rounded-lg border-2" style={{ borderColor: formData.sticker_qr_frame_color }} />
                <p className="text-[9px] font-black uppercase tracking-widest mt-3" style={{ color: formData.sticker_muted_text_color }}>Scaneie para pedir</p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button type="submit" disabled={loading || uploading} className="w-full md:w-auto px-12 bg-gray-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-transform active:scale-95 italic">
              {loading ? 'Sincronizando...' : 'Aplicar Configurações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminSettings;
