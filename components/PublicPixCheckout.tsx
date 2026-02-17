import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRious from 'qrious';
import { AlertCircle, CheckCircle2, Copy, Loader2, QrCode, Settings2 } from 'lucide-react';
import { supabase } from '../services/supabase';
import { StoreSettings } from '../types';

type PlanSelection = {
  nome: string;
  descricao: string;
  valor: number | null;
};

function gerarPayloadPixBCB({
  chavePix,
  nomeRecebedor,
  cidadeRecebedor,
  valor = null,
  txid = "***",
  descricao = null,
  reutilizavel = true,
}: {
  chavePix?: string;
  nomeRecebedor?: string;
  cidadeRecebedor?: string;
  valor?: number | null;
  txid?: string;
  descricao?: string | null;
  reutilizavel?: boolean;
} = {}) {
  if (!chavePix || typeof chavePix !== "string") throw new Error("chavePix é obrigatória (string).");
  if (!nomeRecebedor || typeof nomeRecebedor !== "string") throw new Error("nomeRecebedor é obrigatório (string).");
  if (!cidadeRecebedor || typeof cidadeRecebedor !== "string") throw new Error("cidadeRecebedor é obrigatória (string).");

  const ID_PAYLOAD_FORMAT_INDICATOR = "00";
  const ID_POINT_OF_INITIATION_METHOD = "01";
  const ID_MERCHANT_ACCOUNT_INFORMATION = "26";
  const ID_MERCHANT_ACCOUNT_INFORMATION_GUI = "00";
  const ID_MERCHANT_ACCOUNT_INFORMATION_KEY = "01";
  const ID_MERCHANT_ACCOUNT_INFORMATION_DESCRIPTION = "02";
  const ID_MERCHANT_CATEGORY_CODE = "52";
  const ID_TRANSACTION_CURRENCY = "53";
  const ID_TRANSACTION_AMOUNT = "54";
  const ID_COUNTRY_CODE = "58";
  const ID_MERCHANT_NAME = "59";
  const ID_MERCHANT_CITY = "60";
  const ID_ADDITIONAL_DATA_FIELD_TEMPLATE = "62";
  const ID_ADDITIONAL_DATA_FIELD_TEMPLATE_TXID = "05";
  const ID_CRC16 = "63";

  function onlyASCII(str) {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim();
  }

  function getValue(id, value) {
    const v = String(value);
    const size = String(v.length).padStart(2, "0");
    return id + size + v;
  }

  function formatAmount(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new Error("valor deve ser number >= 0 (ou null para não incluir o campo 54).");
    }
    return v.toFixed(2);
  }

  function buildMerchantAccountInfo() {
    const gui = getValue(ID_MERCHANT_ACCOUNT_INFORMATION_GUI, "br.gov.bcb.pix");
    const key = getValue(ID_MERCHANT_ACCOUNT_INFORMATION_KEY, chavePix);

    let desc = "";
    if (descricao != null && String(descricao).trim() !== "") {
      const d = onlyASCII(String(descricao));
      if (d) desc = getValue(ID_MERCHANT_ACCOUNT_INFORMATION_DESCRIPTION, d.slice(0, 99));
    }

    return getValue(ID_MERCHANT_ACCOUNT_INFORMATION, gui + key + desc);
  }

  function buildAdditionalDataFieldTemplate() {
    const t = onlyASCII(String(txid || "")).replace(/ /g, "").slice(0, 25);
    const finalTxid = t.length >= 1 ? t : "***";
    return getValue(
      ID_ADDITIONAL_DATA_FIELD_TEMPLATE,
      getValue(ID_ADDITIONAL_DATA_FIELD_TEMPLATE_TXID, finalTxid)
    );
  }

  function crc16ccitt(payload) {
    let crc = 0xFFFF;
    const poly = 0x1021;
    const input = payload + ID_CRC16 + "04";

    for (let i = 0; i < input.length; i++) {
      crc ^= (input.charCodeAt(i) & 0xff) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) crc = ((crc << 1) ^ poly) & 0xFFFF;
        else crc = (crc << 1) & 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  const nome = onlyASCII(nomeRecebedor).slice(0, 25);
  const cidade = onlyASCII(cidadeRecebedor).slice(0, 15);

  if (!nome) throw new Error("nomeRecebedor ficou vazio após sanitização.");
  if (!cidade) throw new Error("cidadeRecebedor ficou vazia após sanitização.");

  let payload =
    getValue(ID_PAYLOAD_FORMAT_INDICATOR, "01") +
    getValue(ID_POINT_OF_INITIATION_METHOD, reutilizavel ? "11" : "12") +
    buildMerchantAccountInfo() +
    getValue(ID_MERCHANT_CATEGORY_CODE, "0000") +
    getValue(ID_TRANSACTION_CURRENCY, "986") +
    (valor === null ? "" : getValue(ID_TRANSACTION_AMOUNT, formatAmount(valor))) +
    getValue(ID_COUNTRY_CODE, "BR") +
    getValue(ID_MERCHANT_NAME, nome) +
    getValue(ID_MERCHANT_CITY, cidade) +
    buildAdditionalDataFieldTemplate();

  const crc = crc16ccitt(payload);
  return payload + ID_CRC16 + "04" + crc;
}

const formatCurrency = (value: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
};

const parsePlanSelectionFromUrl = (): PlanSelection => {
  const params = new URLSearchParams(window.location.search || '');
  const nome = (params.get('nome') || '').trim() || 'Plano mensal';
  const descricao = (params.get('descricao') || '').trim() || 'Assinatura mensal do sistema';
  const rawValor = (params.get('valor') || '').trim().replace(',', '.');
  const parsedValor = rawValor ? Number(rawValor) : null;
  const valor = parsedValor != null && Number.isFinite(parsedValor) && parsedValor >= 0 ? parsedValor : null;
  return { nome, descricao, valor };
};

const PublicPixCheckout: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [payload, setPayload] = useState('');
  const [payloadError, setPayloadError] = useState('');
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const planSelection = useMemo(() => parsePlanSelectionFromUrl(), []);
  const redirectToUaitech = useMemo(() => {
    const currentPath = `${window.location.pathname || ''}${window.location.search || ''}`;
    return `/uaitech?redirect=${encodeURIComponent(currentPath)}`;
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      setLoadError('');
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (error) {
        setLoadError(error.message || 'Falha ao carregar credenciais Pix.');
        setLoading(false);
        return;
      }
      setSettings((data || null) as StoreSettings | null);
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const pixConfig = useMemo(() => {
    return {
      chavePix: String((settings as any)?.pix_checkout_chave || '').trim(),
      nomeRecebedor: String((settings as any)?.pix_checkout_nome_recebedor || '').trim(),
      cidadeRecebedor: String((settings as any)?.pix_checkout_cidade_recebedor || '').trim(),
      descricao: String((settings as any)?.pix_checkout_descricao || '').trim(),
      txid: String((settings as any)?.pix_checkout_txid || '***').trim() || '***',
      reutilizavel: (settings as any)?.pix_checkout_reutilizavel !== false,
    };
  }, [settings]);

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!pixConfig.chavePix) missing.push('chavePix');
    if (!pixConfig.nomeRecebedor) missing.push('nomeRecebedor');
    if (!pixConfig.cidadeRecebedor) missing.push('cidadeRecebedor');
    return missing;
  }, [pixConfig.cidadeRecebedor, pixConfig.chavePix, pixConfig.nomeRecebedor]);

  useEffect(() => {
    if (loading || loadError) return;

    if (missingFields.length > 0) {
      setPayload('');
      setPayloadError('');
      return;
    }

    try {
      const generatedPayload = gerarPayloadPixBCB({
        chavePix: pixConfig.chavePix,
        nomeRecebedor: pixConfig.nomeRecebedor,
        cidadeRecebedor: pixConfig.cidadeRecebedor,
        valor: planSelection.valor,
        txid: pixConfig.txid || '***',
        descricao: planSelection.descricao || pixConfig.descricao || null,
        reutilizavel: pixConfig.reutilizavel,
      });

      setPayload(generatedPayload);
      setPayloadError('');
    } catch (err: any) {
      setPayload('');
      setPayloadError(err?.message || 'Falha ao gerar payload Pix.');
    }
  }, [
    loadError,
    loading,
    missingFields.length,
    pixConfig.chavePix,
    pixConfig.cidadeRecebedor,
    pixConfig.descricao,
    pixConfig.nomeRecebedor,
    pixConfig.reutilizavel,
    pixConfig.txid,
    planSelection.descricao,
    planSelection.valor,
  ]);

  useEffect(() => {
    if (!canvasRef.current || !payload) return;
    new QRious({
      element: canvasRef.current,
      value: payload,
      size: 320,
      level: 'M',
      padding: 10,
    });
  }, [payload]);

  const handleCopyPayload = async () => {
    if (!payload || copying) return;
    setCopying(true);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setPayloadError('Nao foi possivel copiar o payload.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 sm:py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Checkout interno</p>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-2">Checkout Pix</h1>
              <p className="text-sm text-slate-500 mt-2">Escaneie o QR Code ou use o campo copia e cola.</p>
            </div>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="h-11 px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600"
            >
              Voltar
            </button>
          </div>
        </header>

        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 mb-4">Plano selecionado</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Nome</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{planSelection.nome}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Descricao</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{planSelection.descricao}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Valor</p>
              <p className="mt-1 text-base font-black text-slate-900">{formatCurrency(planSelection.valor)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Recebedor</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{pixConfig.nomeRecebedor || '-'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Cidade</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{pixConfig.cidadeRecebedor || '-'}</p>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 flex items-center gap-3 text-slate-700">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-700" />
              <span className="text-sm font-semibold">Carregando credenciais Pix...</span>
            </div>
          )}

          {!loading && loadError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 flex items-start gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.15em]">Erro</p>
                <p className="text-sm font-semibold mt-1">{loadError}</p>
              </div>
            </div>
          )}

          {!loading && !loadError && missingFields.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3 text-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5" />
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.15em]">Credenciais Pix pendentes</p>
                  <p className="text-sm font-semibold mt-1">
                    Configure os campos em /uaitech: {missingFields.join(', ')}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.history.pushState({}, '', redirectToUaitech)}
                className="h-11 px-5 rounded-xl border border-amber-300 bg-white hover:bg-amber-100 text-[11px] font-black uppercase tracking-[0.14em] text-amber-800 inline-flex items-center gap-2"
              >
                <Settings2 className="w-4 h-4" />
                Configurar em /uaitech
              </button>
            </div>
          )}

          {!loading && !loadError && missingFields.length === 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col items-center gap-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">QR Code Pix</p>
                {payload ? (
                  <canvas ref={canvasRef} className="w-full max-w-[320px] h-auto rounded-lg bg-white border border-slate-200 p-2" />
                ) : (
                  <div className="w-full max-w-[320px] aspect-square rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                    <QrCode className="w-10 h-10" />
                  </div>
                )}
                <p className="text-xs text-slate-500 font-semibold text-center">
                  Escaneie com o app do seu banco para pagar.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Copia e cola</p>
                    <p className="text-xs text-slate-500 mt-1">Copie o payload Pix e cole no aplicativo do banco.</p>
                  </div>
                  {copied && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Copiado
                    </span>
                  )}
                </div>

                <textarea
                  value={payload}
                  readOnly
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 leading-relaxed resize-none"
                />

                <button
                  type="button"
                  onClick={handleCopyPayload}
                  disabled={!payload || copying}
                  className="h-12 px-5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-black uppercase tracking-[0.14em] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  {copying ? 'Copiando...' : 'Copiar payload'}
                </button>

                {payloadError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {payloadError}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default PublicPixCheckout;
