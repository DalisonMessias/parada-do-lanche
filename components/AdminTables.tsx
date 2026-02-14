import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { generateStickerPdf } from '../services/stickerPdf';
import { StoreSettings, Table } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import StickerCard, { StickerTheme } from './stickers/StickerCard';
import AppModal from './ui/AppModal';

interface AdminTablesProps {
  settings: StoreSettings | null;
}

const isDiningQrTable = (table: Table) => {
  const type = (table.table_type || '').toUpperCase();
  const name = (table.name || '').trim().toUpperCase();
  const token = (table.token || '').trim().toLowerCase();
  if (type === 'COUNTER') return false;
  if (name.startsWith('BALCAO')) return false;
  if (token.startsWith('counter-')) return false;
  return true;
};

const chunkTables = (items: Table[], chunkSize: number) => {
  const pages: Table[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    pages.push(items.slice(i, i + chunkSize));
  }
  return pages;
};

const normalizeFilePart = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const formatDateYYYYMMDD = (dt: Date) => {
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const AdminTables: React.FC<AdminTablesProps> = ({ settings }) => {
  const { toast, confirm } = useFeedback();
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [wifiSsid, setWifiSsid] = useState(settings?.wifi_ssid || '');
  const [wifiPass, setWifiPass] = useState(settings?.wifi_password || '');
  const [savingWifi, setSavingWifi] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const fetchTables = async () => {
    const { data, error } = await supabase.from('tables').select('*').order('name');
    if (error) {
      console.error('Erro ao buscar mesas:', error);
    } else if (data) {
      setTables((data as Table[]).filter(isDiningQrTable));
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    if (!showPrintModal) return;
    setWifiSsid(settings?.wifi_ssid || '');
    setWifiPass(settings?.wifi_password || '');
  }, [showPrintModal, settings?.wifi_ssid, settings?.wifi_password]);

  const handleCreateMesa = async () => {
    const usedNumbers = tables
      .map((table) => Number((table.name.match(/\d+/)?.[0] || '0')))
      .filter((numberValue) => numberValue > 0)
      .sort((a, b) => a - b);

    let nextNumber = 1;
    for (const numberValue of usedNumbers) {
      if (numberValue === nextNumber) nextNumber += 1;
      else if (numberValue > nextNumber) break;
    }

    const name = `Mesa ${nextNumber.toString().padStart(2, '0')}`;
    const token = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 20);
    const { error } = await supabase.from('tables').insert({ name, token });

    if (error) {
      toast(`Erro ao criar mesa: ${error.message}`, 'error');
      return;
    }
    toast('Mesa criada com sucesso!', 'success');
    fetchTables();
  };

  const handleDeleteMesa = async (id: string) => {
    const ok = await confirm('Deseja excluir esta mesa? A exclusao falha se o SQL atualizado nao foi aplicado.');
    if (!ok) return;

    const { error } = await supabase.from('tables').delete().eq('id', id);
    if (error) {
      console.error('Erro ao excluir mesa:', error);
      toast(`Nao foi possivel excluir: ${error.message}`, 'error');
      return;
    }

    setTables((previous) => previous.filter((table) => table.id !== id));
    toast('Mesa excluida com sucesso!', 'success');
  };

  const handleSaveWifiDefaults = async () => {
    setSavingWifi(true);
    const { error } = await supabase.from('settings').upsert({
      id: 1,
      wifi_ssid: wifiSsid.trim(),
      wifi_password: wifiPass,
    });
    setSavingWifi(false);
    if (error) {
      toast(`Erro ao salvar Wi-Fi: ${error.message}`, 'error');
      return;
    }
    toast('Wi-Fi padrao salvo com sucesso!', 'success');
  };

  const stickerTheme: StickerTheme = {
    bg: settings?.sticker_bg_color || '#ffffff',
    text: settings?.sticker_text_color || '#111827',
    border: settings?.sticker_border_color || '#222222',
    muted: settings?.sticker_muted_text_color || '#9ca3af',
    qrFrame: settings?.sticker_qr_frame_color || '#111111',
  };

  const tablesToPrint = useMemo(() => (selectedTable ? [selectedTable] : tables), [selectedTable, tables]);
  const printPages = useMemo(() => chunkTables(tablesToPrint, 4), [tablesToPrint]);
  const showWifiQr = Boolean(wifiSsid && wifiPass);

  useEffect(() => {
    pageRefs.current = pageRefs.current.slice(0, printPages.length);
  }, [printPages.length]);

  const generateMenuUrl = (token: string) => `${window.location.origin}/#/m/${token}`;
  const generateWifiString = () => `WIFI:S:${wifiSsid};T:WPA;P:${wifiPass};;`;
  const getQrUrl = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&margin=0`;
  const getQrFallbackUrl = (data: string) => `https://quickchart.io/qr?size=300&text=${encodeURIComponent(data)}`;

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf || tablesToPrint.length === 0) return;

    setIsGeneratingPdf(true);
    setPdfStatus('Gerando PDF...');
    const exportClassName = 'sticker-pdf-exporting';
    document.body.classList.add(exportClassName);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      const pages = pageRefs.current.filter((node): node is HTMLDivElement => !!node);
      if (pages.length === 0) {
        throw new Error('Nenhuma pagina pronta para gerar PDF.');
      }

      const fileName = selectedTable
        ? `adesivo_${normalizeFilePart(selectedTable.name) || normalizeFilePart(selectedTable.id) || 'mesa'}.pdf`
        : `adesivos_${formatDateYYYYMMDD(new Date())}_${tablesToPrint.length}.pdf`;

      await generateStickerPdf({
        pages,
        fileName,
        onProgress: ({ current, total }) => {
          setPdfStatus(`Gerando PDF... (${current}/${total})`);
        },
      });
    } catch (error) {
      console.error('Falha ao gerar PDF de etiquetas:', error);
      toast('Falha ao gerar PDF, tente novamente.', 'error');
    } finally {
      document.body.classList.remove(exportClassName);
      setIsGeneratingPdf(false);
      setPdfStatus('');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200">
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Mesas & QR Codes</h2>
          <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1.5 italic">Geracao de identificadores profissionais</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (tables.length > 0) {
                setSelectedTable(null);
                setShowPrintModal(true);
              }
            }}
            className="bg-gray-50 text-gray-500 border border-gray-200 px-5 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
          >
            Baixar PDF em Lote
          </button>
          <button
            onClick={handleCreateMesa}
            className="bg-primary text-white px-5 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
          >
            + Adicionar Mesa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4">
        {tables.map((table) => (
          <div key={table.id} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center gap-4 text-center transition-all hover:border-primary">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl border ${
                table.status === 'FREE' ? 'bg-green-50 text-green-500 border-green-100' : 'bg-amber-50 text-amber-500 border-amber-100'
              }`}
            >
              {table.name.replace('Mesa ', '')}
            </div>

            <div className="space-y-1">
              <p className="font-black text-gray-800 uppercase tracking-tighter text-sm">{table.name}</p>
              <span className={`text-[7px] font-black uppercase tracking-widest italic ${table.status === 'FREE' ? 'text-green-400' : 'text-amber-400'}`}>
                {table.status === 'FREE' ? 'Status: Livre' : 'Status: Ocupada'}
              </span>
            </div>

            <div className="flex flex-col w-full gap-1.5 pt-1 border-t border-gray-50">
              <button
                onClick={() => {
                  setSelectedTable(table);
                  setShowPrintModal(true);
                }}
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-[8px] font-black uppercase tracking-widest"
              >
                Baixar PDF
              </button>
              <button onClick={() => handleDeleteMesa(table.id)} className="text-[7px] text-gray-300 font-black uppercase tracking-widest hover:text-red-500">
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {showPrintModal && (
        <AppModal
          open={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          size="xl"
          zIndex={9999}
          title={
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900 italic">Preview das Etiquetas</h3>
              <p className="text-gray-400 font-black text-[8px] uppercase tracking-[0.2em] mt-1.5">
                Formato A4 - Adesivos 100mm x 100mm - Layout otimizado
              </p>
            </div>
          }
          bodyClassName="space-y-8 sm:space-y-10"
          panelClassName="sm:max-w-[1220px]"
        >
          <div className="grid xl:grid-cols-12 gap-10">
            <div className="xl:col-span-4 space-y-6">
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-5">
                <h4 className="text-[8px] font-black uppercase text-gray-400 tracking-[0.2em]">DADOS DO WI-FI</h4>
                <div className="space-y-3">
                  <input
                    placeholder="Rede (SSID)"
                    value={wifiSsid}
                    onChange={(event) => setWifiSsid(event.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-lg text-[10px] font-black bg-white outline-none focus:border-primary"
                  />
                  <input
                    placeholder="Senha da Rede"
                    type="password"
                    value={wifiPass}
                    onChange={(event) => setWifiPass(event.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-lg text-[10px] font-black bg-white outline-none focus:border-primary"
                  />
                </div>
                <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.12em] leading-relaxed">
                  O QR Wi-Fi abre a tela de conexao. Em alguns celulares, o usuario ainda confirma manualmente.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveWifiDefaults}
                    disabled={savingWifi}
                    className="flex-1 bg-gray-900 text-white py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {savingWifi ? 'Salvando...' : 'Salvar Wi-Fi'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWifiSsid(settings?.wifi_ssid || '');
                      setWifiPass(settings?.wifi_password || '');
                    }}
                    className="px-3 bg-white border border-gray-200 text-gray-500 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest"
                  >
                    Recarregar
                  </button>
                </div>
              </div>
              <button
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-base active:scale-95 italic disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGeneratingPdf ? (pdfStatus || 'Gerando PDF...') : 'BAIXAR PDF'}
              </button>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest text-center">
                {tablesToPrint.length} etiqueta(s) - {printPages.length} pagina(s)
              </p>
            </div>

            <div className="xl:col-span-8 flex flex-col items-center">
              <div className="w-full overflow-auto">
                <div id="print-area" className="print-area-stack min-w-max">
                  {printPages.map((pageTables, pageIndex) => {
                    const pageSlots = [...pageTables, ...Array.from({ length: Math.max(0, 4 - pageTables.length) }, () => null)];
                    return (
                      <div
                        key={`page-${pageIndex}`}
                        ref={(node) => {
                          pageRefs.current[pageIndex] = node;
                        }}
                        className="print-sheet border border-dashed border-gray-200 bg-white shadow-inner"
                      >
                        {pageSlots.map((table, slotIndex) =>
                          table ? (
                            <StickerCard
                              key={`${table.id}-${slotIndex}`}
                              tableName={table.name}
                              logoUrl={settings?.logo_url}
                              storeName="Parada do Lanche"
                              stickerTheme={stickerTheme}
                              menuQrUrl={getQrUrl(generateMenuUrl(table.token))}
                              menuQrFallbackUrl={getQrFallbackUrl(generateMenuUrl(table.token))}
                              wifiQrUrl={getQrUrl(generateWifiString())}
                              wifiQrFallbackUrl={getQrFallbackUrl(generateWifiString())}
                              showWifi={showWifiQr}
                            />
                          ) : (
                            <div key={`blank-${pageIndex}-${slotIndex}`} className="qr-card-container qr-card-placeholder" />
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </AppModal>
      )}

      <style>{`
        .qr-card-container {
          width: 100mm;
          height: 100mm;
          background: white;
          padding: 6mm;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
        }
        .print-area-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }
        .print-sheet {
          width: 200mm;
          min-height: 200mm;
          display: grid;
          grid-template-columns: 100mm 100mm;
          grid-template-rows: 100mm 100mm;
          gap: 0;
          position: relative;
        }
        .print-sheet::before,
        .print-sheet::after {
          content: '';
          position: absolute;
          pointer-events: none;
          z-index: 1;
        }
        .print-sheet::before {
          top: 0;
          bottom: 0;
          left: 50%;
          transform: translateX(-0.5px);
          border-left: 1px dashed #e5e7eb;
        }
        .print-sheet::after {
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-0.5px);
          border-top: 1px dashed #e5e7eb;
        }
        .qr-card-placeholder {
          background: white;
          border: 0.1mm dashed #e5e7eb;
        }
        .qr-card {
          width: 100%;
          height: 100%;
          border: 0.65mm solid #6b7280;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 13px;
          position: relative;
          overflow: hidden;
        }
        body.sticker-pdf-exporting .sticker-table-title {
          transform: translateY(-3px);
        }
      `}</style>
    </div>
  );
};

export default AdminTables;
