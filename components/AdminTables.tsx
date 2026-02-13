
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabase';
import { Table, StoreSettings } from '../types';

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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const AdminTables: React.FC<AdminTablesProps> = ({ settings }) => {
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [wifiSsid, setWifiSsid] = useState(settings?.wifi_ssid || '');
  const [wifiPass, setWifiPass] = useState(settings?.wifi_password || '');
  const [savingWifi, setSavingWifi] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

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
      .map((t) => Number((t.name.match(/\d+/)?.[0] || '0')))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    let num = 1;
    for (const n of usedNumbers) {
      if (n === num) num += 1;
      else if (n > num) break;
    }
    const name = `Mesa ${num.toString().padStart(2, '0')}`;
    const token = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 20);
    const { error } = await supabase.from('tables').insert({ name, token });
    if (error) {
      alert("Erro ao criar mesa: " + error.message);
    } else {
      fetchTables();
    }
  };

  const handleDeleteMesa = async (id: string) => {
    if (!confirm('Deseja excluir esta mesa? ATENÇÃO: Se o script SQL atualizado não foi aplicado no Supabase, a exclusão falhará caso haja pedidos antigos.')) return;
    
    // Tenta excluir a mesa (o cascade no SQL cuida do resto)
    const { error } = await supabase.from('tables').delete().eq('id', id);
    
    if (error) {
      console.error('Erro ao excluir mesa:', error);
      alert(`Não foi possível excluir: ${error.message}. Aplique o novo script SQL para habilitar a exclusão em cascata.`);
    } else {
      setTables(prev => prev.filter(t => t.id !== id));
      alert('Mesa excluída com sucesso!');
    }
  };

  const generateMenuUrl = (token: string) => `${window.location.origin}/#/m/${token}`;
  const generateWifiString = () => `WIFI:S:${wifiSsid};T:WPA;P:${wifiPass};;`;
  const getQrUrl = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&margin=0`;
  
  const handleSaveWifiDefaults = async () => {
    setSavingWifi(true);
    const { error } = await supabase.from('settings').upsert({
      id: 1,
      wifi_ssid: wifiSsid.trim(),
      wifi_password: wifiPass,
    });
    setSavingWifi(false);
    if (error) {
      alert('Erro ao salvar Wi-Fi: ' + error.message);
    } else {
      alert('Wi-Fi padrao salvo com sucesso!');
    }
  };
  const stickerTheme = {
    bg: settings?.sticker_bg_color || '#ffffff',
    text: settings?.sticker_text_color || '#111827',
    border: settings?.sticker_border_color || '#111111',
    muted: settings?.sticker_muted_text_color || '#9ca3af',
    qrFrame: settings?.sticker_qr_frame_color || '#111111',
  };
  const tablesToPrint = selectedTable ? [selectedTable] : tables;
  const printPages = chunkTables(tablesToPrint, 4);

  const handlePrintLabels = () => {
    if (tablesToPrint.length === 0) return;

    const pagesHtml = printPages
      .map((pageTables, pageIndex) => {
        const padded = [...pageTables, ...Array.from({ length: Math.max(0, 4 - pageTables.length) }, () => null)];
        const cards = padded
          .map((table, index) => {
            if (!table) return `<div class="qr-card-container qr-card-placeholder"></div>`;

            const menuQr = getQrUrl(generateMenuUrl(table.token));
            const wifiQr = getQrUrl(generateWifiString());
            const hasWifi = wifiSsid && wifiPass;
            const logoHtml = settings?.logo_url
              ? `<img src="${escapeHtml(settings.logo_url)}" class="logo-img" />`
              : `<div class="logo-fallback">PL</div>`;

            return `
              <div class="qr-card-container">
                <div class="qr-card" style="background-color:${escapeHtml(stickerTheme.bg)};border-color:${escapeHtml(stickerTheme.border)};">
                  <div class="brand-block">
                    ${logoHtml}
                    <span class="store-name" style="color:${escapeHtml(stickerTheme.text)};">${escapeHtml(settings?.store_name || 'Loja')}</span>
                  </div>

                  <div class="table-name-wrap" style="border-color:${escapeHtml(stickerTheme.border)};">
                    <span class="table-name" style="color:${escapeHtml(stickerTheme.text)};">${escapeHtml(table.name)}</span>
                  </div>

                  <div class="qr-row">
                    <div class="qr-col">
                      <div class="qr-frame" style="border-color:${escapeHtml(stickerTheme.qrFrame)};">
                        <img src="${escapeHtml(menuQr)}" class="menu-qr" />
                      </div>
                      <span class="qr-caption" style="color:${escapeHtml(stickerTheme.text)};">CARDAPIO</span>
                    </div>
                    ${
                      hasWifi
                        ? `<div class="qr-col">
                            <div class="wifi-frame">
                              <img src="${escapeHtml(wifiQr)}" class="wifi-qr" />
                            </div>
                            <span class="wifi-caption" style="color:${escapeHtml(stickerTheme.muted)};">WI-FI</span>
                          </div>`
                        : `<div class="wifi-empty">
                            <span style="color:${escapeHtml(stickerTheme.muted)};">Preencha SSID + senha para QR Wi-Fi</span>
                          </div>`
                    }
                  </div>

                  <div class="bottom-note">
                    <p style="color:${escapeHtml(stickerTheme.muted)};">SCANEIE PARA PEDIR</p>
                  </div>
                </div>
              </div>
            `;
          })
          .join('');

        return `<section class="print-sheet" data-page="${pageIndex + 1}">${cards}</section>`;
      })
      .join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiquetas - ${escapeHtml(settings?.store_name || 'Loja')}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .print-root {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      padding: 0;
    }
    .print-sheet {
      width: 200mm;
      min-height: 200mm;
      display: grid;
      grid-template-columns: 100mm 100mm;
      grid-template-rows: 100mm 100mm;
      page-break-after: always;
      break-after: page;
    }
    .print-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .qr-card-container {
      width: 100mm;
      height: 100mm;
      padding: 6mm;
      border: 0.1mm solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
    }
    .qr-card-placeholder {
      border-style: dashed;
      border-color: #e5e7eb;
      background: #fff;
    }
    .qr-card {
      width: 100%;
      height: 100%;
      border: 1mm solid #000;
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 13px;
      position: relative;
    }
    .brand-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      margin-bottom: 10px;
    }
    .logo-img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      border-radius: 6px;
    }
    .logo-fallback {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: #111827;
      color: #fff;
      font-weight: 900;
      font-style: italic;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    .store-name {
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.01em;
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    .table-name-wrap {
      width: 100%;
      border-top: 0.6mm solid;
      border-bottom: 0.6mm solid;
      padding: 4px 0;
      margin-bottom: 12px;
      text-align: center;
    }
    .table-name {
      font-size: 24px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      font-style: italic;
      line-height: 1;
    }
    .qr-row {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
    }
    .qr-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .qr-frame {
      padding: 8px;
      border: 2px solid #111827;
      border-radius: 12px;
      background: #fff;
    }
    .menu-qr {
      width: 80px;
      height: 80px;
    }
    .wifi-frame {
      padding: 8px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #fff;
    }
    .wifi-qr {
      width: 64px;
      height: 64px;
      opacity: 0.6;
    }
    .qr-caption, .wifi-caption {
      font-size: 8px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-style: italic;
    }
    .wifi-empty {
      width: 84px;
      height: 104px;
      border: 1px dashed #e5e7eb;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
      text-align: center;
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      line-height: 1.35;
    }
    .bottom-note {
      text-align: center;
    }
    .bottom-note p {
      margin: 0;
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.35em;
      font-style: italic;
      line-height: 1;
      opacity: 0.8;
    }
    @page { size: A4; margin: 5mm; }
  </style>
</head>
<body>
  <div class="print-root">${pagesHtml}</div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) {
      alert('Nao foi possivel abrir a janela de impressao. Libere pop-up e tente novamente.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error: any) {
        alert(`Falha ao imprimir etiquetas: ${String(error?.message || error || 'erro desconhecido')}`);
      }
    }, 220);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200">
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Mesas & QR Codes</h2>
          <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1.5 italic">Geração de identificadores profissionais</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => { if (tables.length > 0) { setSelectedTable(null); setShowPrintModal(true); } }}
            className="bg-gray-50 text-gray-500 border border-gray-200 px-5 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
          >
            Imprimir Lote
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
        {tables.map(table => (
          <div key={table.id} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center gap-4 text-center transition-all hover:border-primary">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl border ${
              table.status === 'FREE' ? 'bg-green-50 text-green-500 border-green-100' : 'bg-amber-50 text-amber-500 border-amber-100'
            }`}>
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
                onClick={() => { setSelectedTable(table); setShowPrintModal(true); }}
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-[8px] font-black uppercase tracking-widest"
              >
                Gera Adesivo
              </button>
              <button 
                onClick={() => handleDeleteMesa(table.id)}
                className="text-[7px] text-gray-300 font-black uppercase tracking-widest hover:text-red-500"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {showPrintModal && createPortal(
        <div className="fixed left-0 top-0 z-[9999] w-screen h-screen bg-gray-900/95 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 lg:p-6 overflow-y-auto">
          <div className="bg-white w-[min(96vw,1220px)] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] rounded-t-[28px] sm:rounded-[32px] p-5 sm:p-8 lg:p-10 flex flex-col gap-8 sm:gap-10 border border-gray-200 overflow-auto">
            <div className="flex justify-between items-center border-b border-gray-100 pb-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900 italic">Preview das Etiquetas</h3>
                <p className="text-gray-400 font-black text-[8px] uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Formato A4 - Adesivos 100mm x 100mm - Layout otimizado
                </p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="bg-gray-50 p-3 rounded-xl text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="grid xl:grid-cols-12 gap-10">
              <div className="xl:col-span-4 space-y-6">
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-5">
                  <h4 className="text-[8px] font-black uppercase text-gray-400 tracking-[0.2em]">DADOS DO WI-FI</h4>
                  <div className="space-y-3">
                    <input placeholder="Rede (SSID)" value={wifiSsid} onChange={e=>setWifiSsid(e.target.value)} className="w-full p-3.5 border border-gray-200 rounded-lg text-[10px] font-black bg-white outline-none focus:border-primary" />
                    <input placeholder="Senha da Rede" type="password" value={wifiPass} onChange={e=>setWifiPass(e.target.value)} className="w-full p-3.5 border border-gray-200 rounded-lg text-[10px] font-black bg-white outline-none focus:border-primary" />
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
                <button onClick={handlePrintLabels} className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-base active:scale-95 italic">
                  IMPRIMIR AGORA
                </button>
                <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest text-center">
                  {tablesToPrint.length} etiqueta(s) - {printPages.length} pagina(s)
                </p>
              </div>

              <div className="xl:col-span-8 flex flex-col items-center">
                <div className="w-full overflow-auto">
                  <div id="print-area" className="print-area-stack min-w-max">
                    {printPages.map((pageTables, pageIndex) => (
                      <div key={`page-${pageIndex}`} className="print-sheet border border-dashed border-gray-200 bg-white shadow-inner">
                        {[...pageTables, ...Array.from({ length: Math.max(0, 4 - pageTables.length) }, () => null)].map((table, index) => (
                          table ? (
                            <div key={table.id} className="qr-card-container">
                              <div className="qr-card" style={{ backgroundColor: stickerTheme.bg, borderColor: stickerTheme.border }}>
                                <div className="flex flex-col items-center gap-2 mb-4">
                                  {settings?.logo_url ? (
                                    <img src={settings.logo_url} className="w-12 h-12 object-contain rounded-md" />
                                  ) : (
                                    <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center text-white font-black text-base italic">PL</div>
                                  )}
                                  <span className="text-[10px] font-black uppercase tracking-tighter truncate max-w-[140px] text-center" style={{ color: stickerTheme.text }}>{settings?.store_name}</span>
                                </div>

                                <div className="w-full border-t border-b py-2 mb-5 text-center" style={{ borderColor: stickerTheme.border }}>
                                   <span className="text-[24px] font-black uppercase tracking-tighter italic leading-none" style={{ color: stickerTheme.text }}>{table.name}</span>
                                </div>

                                <div className="flex flex-row items-start justify-center gap-5 w-full mb-5">
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="p-2 bg-white border-2 rounded-xl" style={{ borderColor: stickerTheme.qrFrame }}>
                                      <img src={getQrUrl(generateMenuUrl(table.token))} className="w-20 h-20" />
                                    </div>
                                    <span className="text-[8px] font-black uppercase tracking-widest italic" style={{ color: stickerTheme.text }}>CARDAPIO</span>
                                  </div>

                                  {wifiSsid && wifiPass ? (
                                    <div className="flex flex-col items-center gap-2">
                                      <div className="p-2 bg-white border border-gray-200 rounded-xl">
                                        <img src={getQrUrl(generateWifiString())} className="w-16 h-16 opacity-60" />
                                      </div>
                                      <span className="text-[7px] font-black uppercase tracking-widest italic" style={{ color: stickerTheme.muted }}>WI-FI</span>
                                    </div>
                                  ) : (
                                    <div className="w-[84px] h-[104px] rounded-xl border border-dashed border-gray-200 flex items-center justify-center px-2">
                                      <span className="text-[7px] font-black uppercase tracking-widest text-center leading-relaxed" style={{ color: stickerTheme.muted }}>Preencha SSID + senha para QR Wi-Fi</span>
                                    </div>
                                  )}
                                </div>

                                <div className="text-center">
                                  <p className="text-[7px] font-black uppercase tracking-[0.35em] italic leading-none opacity-80" style={{ color: stickerTheme.muted }}>SCANEIE PARA PEDIR</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div key={`blank-${pageIndex}-${index}`} className="qr-card-container qr-card-placeholder" />
                          )
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

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
          border: 0.1mm solid #f0f0f0;
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
        }
        .qr-card-placeholder {
          background: white;
          border: 0.1mm dashed #e5e7eb;
        }
        .qr-card {
          width: 100%;
          height: 100%;
          border: 1mm solid #000;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 13px;
          position: relative;
        }
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area {
            position: static;
            transform: none;
            width: auto;
            padding: 0;
            margin: 0 auto;
            display: block !important;
          }
          .print-area-stack {
            gap: 0 !important;
          }
          .print-sheet {
            margin: 0 auto !important;
            break-after: page;
            page-break-after: always;
            box-shadow: none !important;
            border: 0 !important;
          }
          .print-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .qr-card-container { border: 0.1mm dashed #ddd !important; }
          .qr-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .qr-card-placeholder { border: 0 !important; }
          @page { size: A4; margin: 5mm; }
        }
      `}</style>
    </div>
  );
};

export default AdminTables;

