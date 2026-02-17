import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Save } from 'lucide-react';
import { supabase } from '../services/supabase';
import { StoreSettings } from '../types';

type PixCredentialsForm = {
  chavePix: string;
  nomeRecebedor: string;
  cidadeRecebedor: string;
  descricao: string;
  txid: string;
  reutilizavel: boolean;
};

const DEFAULT_FORM: PixCredentialsForm = {
  chavePix: '',
  nomeRecebedor: '',
  cidadeRecebedor: '',
  descricao: '',
  txid: '***',
  reutilizavel: true,
};

const sanitizeRedirectPath = (value: string) => {
  const normalized = (value || '').trim();
  if (!normalized.startsWith('/')) return '/checkout/pix';
  return normalized;
};

const UaitechPixSettings: React.FC = () => {
  const [form, setForm] = useState<PixCredentialsForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const redirectPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search || '');
    const redirect = params.get('redirect') || '';
    return sanitizeRedirectPath(redirect);
  }, []);

  const isConfigured = useMemo(() => {
    return (
      form.chavePix.trim().length > 0 &&
      form.nomeRecebedor.trim().length > 0 &&
      form.cidadeRecebedor.trim().length > 0
    );
  }, [form.cidadeRecebedor, form.chavePix, form.nomeRecebedor]);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (fetchError) {
        setError(fetchError.message || 'Falha ao carregar credenciais Pix.');
        setLoading(false);
        return;
      }

      const settings = (data || {}) as StoreSettings;
      setForm({
        chavePix: String((settings as any).pix_checkout_chave || '').trim(),
        nomeRecebedor: String((settings as any).pix_checkout_nome_recebedor || '').trim(),
        cidadeRecebedor: String((settings as any).pix_checkout_cidade_recebedor || '').trim(),
        descricao: String((settings as any).pix_checkout_descricao || '').trim(),
        txid: String((settings as any).pix_checkout_txid || '***').trim() || '***',
        reutilizavel: (settings as any).pix_checkout_reutilizavel !== false,
      });
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (!form.chavePix.trim() || !form.nomeRecebedor.trim() || !form.cidadeRecebedor.trim()) {
      setError('Preencha chave Pix, nome do recebedor e cidade do recebedor.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      id: 1,
      pix_checkout_chave: form.chavePix.trim(),
      pix_checkout_nome_recebedor: form.nomeRecebedor.trim(),
      pix_checkout_cidade_recebedor: form.cidadeRecebedor.trim(),
      pix_checkout_descricao: form.descricao.trim() || null,
      pix_checkout_txid: form.txid.trim() || '***',
      pix_checkout_reutilizavel: form.reutilizavel,
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = await supabase.from('settings').upsert(payload, { onConflict: 'id' });

    if (saveError) {
      setError(saveError.message || 'Falha ao salvar credenciais Pix.');
      setSaving(false);
      return;
    }

    setMessage('Credenciais Pix salvas com sucesso.');
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 px-6 py-10 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-700" />
          <span className="text-sm font-semibold text-slate-700">Carregando painel /uaitech...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 sm:py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-black tracking-[0.25em] uppercase text-slate-400">Configuracao Pix</p>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-2">Painel /uaitech</h1>
              <p className="text-sm text-slate-500 mt-2">Cadastre os dados usados para gerar o checkout Pix interno.</p>
            </div>
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                isConfigured
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}
            >
              {isConfigured ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {isConfigured ? 'Configurado' : 'Nao configurado'}
            </span>
          </div>
        </header>

        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-2 sm:col-span-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">chavePix *</span>
              <input
                type="text"
                value={form.chavePix}
                onChange={(e) => setForm((prev) => ({ ...prev, chavePix: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-400 focus:bg-white"
                placeholder="email, cpf, cnpj, telefone ou chave aleatoria"
                autoComplete="off"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">nomeRecebedor *</span>
              <input
                type="text"
                value={form.nomeRecebedor}
                onChange={(e) => setForm((prev) => ({ ...prev, nomeRecebedor: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-400 focus:bg-white"
                placeholder="Nome do recebedor"
                autoComplete="off"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">cidadeRecebedor *</span>
              <input
                type="text"
                value={form.cidadeRecebedor}
                onChange={(e) => setForm((prev) => ({ ...prev, cidadeRecebedor: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-400 focus:bg-white"
                placeholder="Cidade do recebedor"
                autoComplete="off"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">descricao (opcional)</span>
              <input
                type="text"
                value={form.descricao}
                onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-400 focus:bg-white"
                placeholder="Descricao default para o checkout"
                autoComplete="off"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">txid</span>
              <input
                type="text"
                value={form.txid}
                onChange={(e) => setForm((prev) => ({ ...prev, txid: e.target.value }))}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-400 focus:bg-white"
                placeholder="***"
                autoComplete="off"
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 h-12 mt-7">
              <input
                type="checkbox"
                checked={form.reutilizavel}
                onChange={(e) => setForm((prev) => ({ ...prev, reutilizavel: e.target.checked }))}
                className="w-4 h-4 accent-cyan-700"
              />
              <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">Cobrança reutilizavel</span>
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-semibold">
              {message}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-black uppercase tracking-[0.16em] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar credenciais'}
            </button>

            <button
              type="button"
              onClick={() => window.history.pushState({}, '', redirectPath)}
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-xs font-black uppercase tracking-[0.16em]"
            >
              <CreditCard className="w-4 h-4" />
              Ir para checkout Pix
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UaitechPixSettings;
