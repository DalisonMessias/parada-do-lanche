
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Table, StoreSettings } from '../types';

interface AdminTablesProps {
  settings: StoreSettings | null;
}

const AdminTables: React.FC<AdminTablesProps> = ({ settings }) => {
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const fetchTables = async () => {
    const { data, error } = await supabase.from('tables').select('*').order('name');
    if (error) {
      console.error('Erro ao buscar mesas:', error);
    } else if (data) {
      setTables(data);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const handleCreateMesa = async () => {
    const num = tables.length + 1;
    const name = `Mesa ${num.toString().padStart(2, '0')}`;
    const token = Math.random().toString(36).substring(2, 15);
    const { error } = await supabase.from('tables').insert({ name, token });
    if (error) {
      alert("Erro ao criar mesa: " + error.message);
    } else {
      fetchTables();
    }
  };

  const handleDeleteMesa = async (id: string) => {
    if (!confirm('Deseja excluir esta mesa? ATENÃ‡ÃƒO: Se o script SQL atualizado nÃ£o foi aplicado no Supabase, a exclusÃ£o falharÃ¡ caso haja pedidos antigos.')) return;
    
    // Tenta excluir a mesa (o cascade no SQL cuida do resto)
    const { error } = await supabase.from('tables').delete().eq('id', id);
    
    if (error) {
      console.error('Erro ao excluir mesa:', error);
      alert(`NÃ£o foi possÃ­vel excluir: ${error.message}. Aplique o novo script SQL para habilitar a exclusÃ£o em cascata.`);
    } else {
      setTables(prev => prev.filter(t => t.id !== id));
      alert('Mesa excluÃ­da com sucesso!');
    }
  };

  const generateMenuUrl = (token: string) => `${window.location.origin}/#/m/${token}`;
  const generateWifiString = () => `WIFI:S:${wifiSsid};T:WPA;P:${wifiPass};;`;
  const getQrUrl = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&margin=0`;
  const stickerTheme = {
    bg: settings?.sticker_bg_color || '#ffffff',
    text: settings?.sticker_text_color || '#111827',
    border: settings?.sticker_border_color || '#111111',
    muted: settings?.sticker_muted_text_color || '#9ca3af',
    qrFrame: settings?.sticker_qr_frame_color || '#111111',
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200">
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Mesas & QR Codes</h2>
          <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1.5 italic">GeraÃ§Ã£o de identificadores profissionais</p>
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

      {showPrintModal && (
        <div className="fixed inset-0 z-[100] bg-gray-900/95 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-[32px] p-8 lg:p-10 space-y-10 border border-gray-200">
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

            <div className="grid lg:grid-cols-12 gap-10">
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-5">
                  <h4 className="text-[8px] font-black uppercase text-gray-400 tracking-[0.2em]">DADOS DO WI-FI</h4>
                  <div className="space-y-3">
                    <input placeholder="Rede (SSID)" value={wifiSsid} onChange={e=>setWifiSsid(e.target.value)} className="w-full p-3.5 border border-gray-200 rounded-lg text-[10px] font-black bg-white outline-none focus:border-primary" />
                    <input placeholder="Senha da Rede" type="password" value={wifiPass} onChange={e=>setWifiPass(e.target.value)} className="w-full p-3.5 border border-gray-200 rounded-lg text-[10px] font-black bg-white outline-none focus:border-primary" />
                  </div>
                  <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.12em] leading-relaxed">
                    O QR Wi-Fi abre a tela de conexao. Em alguns celulares, o usuario ainda confirma manualmente.
                  </p>
                </div>
                <button onClick={() => window.print()} className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-base active:scale-95 italic">
                  IMPRIMIR AGORA
                </button>
              </div>

              <div className="lg:col-span-8 flex flex-col items-center">
                <div id="print-area" className="grid grid-cols-2 gap-0 border border-dashed border-gray-200 bg-white shadow-inner">
                  {(selectedTable ? [selectedTable] : tables.slice(0, 6)).map(table => (
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
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
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
          border: 0.1mm solid #f0f0f0;
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
            position: fixed;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
            padding: 5mm;
            display: grid !important;
            grid-template-columns: 100mm 100mm !important;
            grid-template-rows: 100mm 100mm 100mm !important;
            gap: 0 !important;
            background: white !important;
            z-index: 99999;
          }
          .qr-card-container { border: 0.1mm dashed #ddd !important; }
          .qr-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );
};

export default AdminTables;

