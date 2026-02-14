
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { StoreSettings, Profile, WaiterFeeMode, PixKeyType } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import CustomSelect from './ui/CustomSelect';
import StickerCard, { StickerTheme } from './stickers/StickerCard';
import { getPixPlaceholder, maskPixInput, normalizePixValue, validatePixValue } from '../services/pixKey';
import { playOrderAlertSound } from '../services/notifications';

interface AdminSettingsProps {
  settings: StoreSettings | null;
  onUpdate: () => void;
  profile: Profile | null;
}

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parseMaskedCurrencyToCents = (value: string) => {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return 0;
  const cents = Number(digits);
  return Number.isFinite(cents) ? Math.max(0, cents) : 0;
};

const formatCentsToMaskedCurrency = (cents: number) =>
  `R$ ${brlFormatter.format(Math.max(0, Number(cents || 0)) / 100)}`;

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const AdminSettings: React.FC<AdminSettingsProps> = ({ settings, onUpdate, profile }) => {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [defaultDeliveryFeeMasked, setDefaultDeliveryFeeMasked] = useState('R$ 0,00');
  const [waiterFeePercentValue, setWaiterFeePercentValue] = useState(10);
  const [waiterFeeFixedMasked, setWaiterFeeFixedMasked] = useState('R$ 0,00');
  const [savedPixKeyValue, setSavedPixKeyValue] = useState('');
  const [formData, setFormData] = useState({
    logo_url: '',
    order_approval_mode: 'HOST' as 'HOST' | 'SELF',
    enable_counter_module: true,
    enable_waiter_fee: false,
    waiter_fee_mode: 'PERCENT' as WaiterFeeMode,
    waiter_fee_value: 10,
    default_delivery_fee_cents: 0,
    pix_key_type: 'cpf' as PixKeyType,
    pix_key_value: '',
    notification_sound_enabled: false,
    notification_sound_url: '',
    sticker_bg_color: '#ffffff',
    sticker_text_color: '#111827',
    sticker_border_color: '#111111',
    sticker_muted_text_color: '#9ca3af',
    sticker_qr_frame_color: '#111111'
  });

  const isAdmin = profile?.role === 'ADMIN';

  useEffect(() => {
    if (settings) {
      const defaultDeliveryFeeCents = Number(settings.default_delivery_fee_cents || 0);
      const waiterFeeMode: WaiterFeeMode = settings.waiter_fee_mode === 'FIXED' ? 'FIXED' : 'PERCENT';
      const rawWaiterFeeValue = Number(
        settings.waiter_fee_value ?? (waiterFeeMode === 'PERCENT' ? 10 : 0)
      );
      const normalizedWaiterFeeValue =
        waiterFeeMode === 'PERCENT' ? clampPercent(rawWaiterFeeValue) : Math.max(0, rawWaiterFeeValue);
      const pixType: PixKeyType = (settings.pix_key_type || 'cpf') as PixKeyType;
      const pixValueMasked = maskPixInput(pixType, settings.pix_key_value || '');

      setFormData({
        logo_url: settings.logo_url || '',
        order_approval_mode: (settings.order_approval_mode || 'HOST') as 'HOST' | 'SELF',
        enable_counter_module: settings.enable_counter_module !== false,
        enable_waiter_fee: settings.enable_waiter_fee === true,
        waiter_fee_mode: waiterFeeMode,
        waiter_fee_value: normalizedWaiterFeeValue,
        default_delivery_fee_cents: defaultDeliveryFeeCents,
        pix_key_type: pixType,
        pix_key_value: pixValueMasked,
        notification_sound_enabled: settings.notification_sound_enabled === true,
        notification_sound_url: settings.notification_sound_url || '',
        sticker_bg_color: settings.sticker_bg_color || '#ffffff',
        sticker_text_color: settings.sticker_text_color || '#111827',
        sticker_border_color: settings.sticker_border_color || '#111111',
        sticker_muted_text_color: settings.sticker_muted_text_color || '#9ca3af',
        sticker_qr_frame_color: settings.sticker_qr_frame_color || '#111111'
      });
      setSavedPixKeyValue(settings.pix_key_value || '');
      setDefaultDeliveryFeeMasked(formatCentsToMaskedCurrency(defaultDeliveryFeeCents));
      setWaiterFeePercentValue(waiterFeeMode === 'PERCENT' ? normalizedWaiterFeeValue : 10);
      setWaiterFeeFixedMasked(
        formatCentsToMaskedCurrency(waiterFeeMode === 'FIXED' ? normalizedWaiterFeeValue : 0)
      );
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
      toast(`Erro no upload: ${error.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const rawPixValue = (formData.pix_key_value || '').trim();
    let pixTypeToSave: PixKeyType | null = formData.pix_key_type;
    let pixValueToSave: string | null = rawPixValue;

    if (!rawPixValue) {
      pixTypeToSave = null;
      pixValueToSave = null;
    } else {
      if (!validatePixValue(formData.pix_key_type, rawPixValue)) {
        toast('Chave Pix invalida para o tipo selecionado.', 'error');
        return;
      }
      pixValueToSave = normalizePixValue(formData.pix_key_type, rawPixValue);
    }

    const soundUrl = (formData.notification_sound_url || '').trim();
    if (soundUrl && !/^https?:\/\//i.test(soundUrl)) {
      toast('Informe uma URL valida para o som MP3.', 'error');
      return;
    }

    setLoading(true);
    const waiterFeeValue =
      formData.waiter_fee_mode === 'PERCENT'
        ? clampPercent(waiterFeePercentValue)
        : parseMaskedCurrencyToCents(waiterFeeFixedMasked);
    const payload = {
      id: 1,
      ...formData,
      pix_key_type: pixTypeToSave,
      pix_key_value: pixValueToSave,
      notification_sound_url: soundUrl,
      waiter_fee_mode: formData.waiter_fee_mode,
      waiter_fee_value: waiterFeeValue,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('settings').upsert(payload);
    if (error) toast(`Erro ao salvar: ${error.message}`, 'error');
    else {
      setSavedPixKeyValue(pixValueToSave || '');
      onUpdate();
      toast('Configuracoes atualizadas!', 'success');
    }
    setLoading(false);
  };

  const previewWifiSsid = (settings?.wifi_ssid || '').trim();
  const previewWifiPassword = settings?.wifi_password || '';
  const showWifiQr = Boolean(previewWifiSsid && previewWifiPassword);

  const buildMenuUrl = () => `${window.location.origin}/#/m/preview-settings`;
  const buildWifiString = () => `WIFI:S:${previewWifiSsid};T:WPA;P:${previewWifiPassword};;`;
  const getQrUrl = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&margin=0`;
  const getQrFallbackUrl = (data: string) => `https://quickchart.io/qr?size=300&text=${encodeURIComponent(data)}`;

  const stickerTheme: StickerTheme = {
    bg: formData.sticker_bg_color,
    text: formData.sticker_text_color,
    border: formData.sticker_border_color,
    muted: formData.sticker_muted_text_color,
    qrFrame: formData.sticker_qr_frame_color,
  };

  const pixPlaceholder = getPixPlaceholder(formData.pix_key_type);
  const showCopyPixButton = Boolean((savedPixKeyValue || '').trim());

  const handlePixTypeChange = (nextType: PixKeyType) => {
    const maskedValue = maskPixInput(nextType, formData.pix_key_value || '');
    setFormData((prev) => ({
      ...prev,
      pix_key_type: nextType,
      pix_key_value: maskedValue,
    }));
  };

  const handlePixValueChange = (rawValue: string) => {
    const maskedValue = maskPixInput(formData.pix_key_type, rawValue);
    setFormData((prev) => ({ ...prev, pix_key_value: maskedValue }));
  };

  const handleCopyPixKey = async () => {
    const key = (savedPixKeyValue || '').trim();
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast('Copiado!', 'success');
    } catch {
      toast('Nao foi possivel copiar a chave Pix.', 'error');
    }
  };

  const handleTestNotificationSound = async () => {
    await playOrderAlertSound({
      enabled: formData.notification_sound_enabled,
      mp3Url: formData.notification_sound_url,
      force: true,
      throttleMs: 0,
    });
    toast('Som de teste executado.', 'info');
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
            <div className="space-y-2 md:col-span-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">MODO DE ACEITE DA MESA</label>
              <CustomSelect
                value={formData.order_approval_mode}
                onChange={(nextValue) => setFormData({ ...formData, order_approval_mode: nextValue as 'HOST' | 'SELF' })}
                options={[
                  { value: 'HOST', label: 'Responsavel da mesa aprova tudo (recomendado)' },
                  { value: 'SELF', label: 'Cada pessoa aprova o proprio pedido' },
                ]}
                buttonClassName="p-4 text-sm"
              />
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
                  aria-label="Habilitar modulo Balcao"
                />
              </label>
            </div>

            <div className="space-y-3 md:col-span-2 rounded-2xl border border-gray-100 p-4 bg-gray-50">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Taxa do Garcom</p>
              <label className="flex items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-sm font-black text-gray-800">Ativar taxa de garcom</p>
                  <p className="text-[10px] text-gray-500 font-bold">Escolha percentual (%) ou valor fixo para aplicar no pagamento da mesa.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.enable_waiter_fee}
                  onChange={(e) => setFormData({ ...formData, enable_waiter_fee: e.target.checked })}
                  aria-label="Ativar taxa de garcom"
                />
              </label>
              {formData.enable_waiter_fee && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Modo da taxa</label>
                    <CustomSelect
                      value={formData.waiter_fee_mode}
                      onChange={(nextValue) => {
                        const nextMode = (nextValue as WaiterFeeMode) === 'FIXED' ? 'FIXED' : 'PERCENT';
                        const nextValueByMode =
                          nextMode === 'PERCENT'
                            ? clampPercent(waiterFeePercentValue)
                            : parseMaskedCurrencyToCents(waiterFeeFixedMasked);
                        setFormData((prev) => ({
                          ...prev,
                          waiter_fee_mode: nextMode,
                          waiter_fee_value: nextValueByMode,
                        }));
                      }}
                      options={[
                        { value: 'PERCENT', label: 'Percentual (%)' },
                        { value: 'FIXED', label: 'Valor fixo (R$)' },
                      ]}
                      buttonClassName="p-4 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      {formData.waiter_fee_mode === 'PERCENT' ? 'Percentual (%)' : 'Valor fixo (R$)'}
                    </label>
                    {formData.waiter_fee_mode === 'PERCENT' ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={waiterFeePercentValue}
                        onChange={(e) => {
                          const next = clampPercent(Number(e.target.value || 0));
                          setWaiterFeePercentValue(next);
                          setFormData((prev) => ({ ...prev, waiter_fee_value: next }));
                        }}
                        className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                        placeholder="0"
                      />
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={waiterFeeFixedMasked}
                        onChange={(e) => {
                          const cents = parseMaskedCurrencyToCents(e.target.value);
                          setWaiterFeeFixedMasked(formatCentsToMaskedCurrency(cents));
                          setFormData((prev) => ({ ...prev, waiter_fee_value: cents }));
                        }}
                        className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                        placeholder="R$ 0,00"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Taxa de entrega padrao (R$)</label>
              <input
                type="text"
                inputMode="numeric"
                value={defaultDeliveryFeeMasked}
                onChange={(e) => {
                  const cents = parseMaskedCurrencyToCents(e.target.value);
                  setDefaultDeliveryFeeMasked(formatCentsToMaskedCurrency(cents));
                  setFormData((prev) => ({ ...prev, default_delivery_fee_cents: cents }));
                }}
                className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                placeholder="R$ 0,00"
              />
              <p className="text-[10px] text-gray-500 font-bold">Usada como valor inicial em pedidos de entrega no Balcao.</p>
            </div>

            <div className="space-y-3 md:col-span-2 rounded-2xl border border-gray-100 p-4 bg-gray-50">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">PIX</p>
              <div className="grid md:grid-cols-5 gap-2">
                {([
                  { value: 'cpf', label: 'CPF' },
                  { value: 'cnpj', label: 'CNPJ' },
                  { value: 'phone', label: 'Telefone' },
                  { value: 'email', label: 'E-mail' },
                  { value: 'random', label: 'Aleatoria' },
                ] as Array<{ value: PixKeyType; label: string }>).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePixTypeChange(option.value)}
                    className={`py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                      formData.pix_key_type === option.value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={formData.pix_key_value}
                  onChange={(e) => handlePixValueChange(e.target.value)}
                  placeholder={pixPlaceholder}
                  className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                />
                {showCopyPixButton && (
                  <button
                    type="button"
                    onClick={handleCopyPixKey}
                    className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Copiar
                  </button>
                )}
              </div>
              <p className="text-[10px] text-gray-500 font-bold">
                Salve para manter a chave Pix disponivel e copiar rapidamente.
              </p>
            </div>

            <div className="space-y-3 md:col-span-2 rounded-2xl border border-gray-100 p-4 bg-gray-50">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Notificacoes de novo pedido</p>
              <label className="flex items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-sm font-black text-gray-800">Ativar som de novo pedido</p>
                  <p className="text-[10px] text-gray-500 font-bold">Toca o som configurado quando chegar novo pedido no Admin.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.notification_sound_enabled}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notification_sound_enabled: e.target.checked }))}
                  aria-label="Ativar som de novo pedido"
                />
              </label>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Link do Som MP3</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={formData.notification_sound_url}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notification_sound_url: e.target.value }))}
                    placeholder="https://dominio.com/alerta.mp3"
                    className="flex-1 p-4 bg-white border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                  />
                  <button
                    type="button"
                    onClick={handleTestNotificationSound}
                    className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Testar Som
                  </button>
                </div>
              </div>
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
                    Utilize arquivos transparentes (PNG/SVG) para garantir que a marca se integre perfeitamente a interface clara.
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

            <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50 overflow-auto">
              <div className="min-w-[390px] flex justify-center">
                <StickerCard
                  tableName="MESA 01"
                  logoUrl={formData.logo_url}
                  storeName="Parada do Lanche"
                  stickerTheme={stickerTheme}
                  menuQrUrl={getQrUrl(buildMenuUrl())}
                  menuQrFallbackUrl={getQrFallbackUrl(buildMenuUrl())}
                  wifiQrUrl={getQrUrl(buildWifiString())}
                  wifiQrFallbackUrl={getQrFallbackUrl(buildWifiString())}
                  showWifi={showWifiQr}
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button type="submit" disabled={loading || uploading} className="w-full md:w-auto px-12 bg-gray-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-transform active:scale-95 italic">
              {loading ? 'Sincronizando...' : 'Aplicar configurações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminSettings;
