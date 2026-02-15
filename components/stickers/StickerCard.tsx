import React from 'react';

export type StickerTheme = {
  bg: string;
  text: string;
  border: string;
  muted: string;
  qrFrame: string;
};

interface StickerCardProps {
  tableName: string;
  logoUrl?: string | null;
  storeName?: string;
  stickerTheme: StickerTheme;
  menuQrUrl: string;
  menuQrFallbackUrl: string;
  wifiQrUrl: string;
  wifiQrFallbackUrl: string;
  showWifi: boolean;
}

const onQrImageError: React.ReactEventHandler<HTMLImageElement> = (event) => {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied === '1') return;
  const fallbackSrc = img.dataset.fallbackSrc;
  if (!fallbackSrc) return;
  img.dataset.fallbackApplied = '1';
  img.src = fallbackSrc;
};

const StickerCard: React.FC<StickerCardProps> = ({
  tableName,
  logoUrl,
  storeName = 'Loja',
  stickerTheme,
  menuQrUrl,
  menuQrFallbackUrl,
  wifiQrUrl,
  wifiQrFallbackUrl,
  showWifi,
}) => {
  return (
    <div
      style={{
        width: '100mm',
        height: '100mm',
        background: '#fff',
        padding: '6mm',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          border: '0.65mm solid #6b7280',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '13px',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: stickerTheme.bg,
        }}
      >
        <div className="flex flex-col items-center gap-2 mb-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              crossOrigin="anonymous"
              loading="eager"
              decoding="sync"
              referrerPolicy="no-referrer"
              className="h-16 object-contain"
              style={{ imageRendering: 'auto' }}
            />
          ) : (
            <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center text-white font-black text-base italic">PL</div>
          )}
          <span
            className="text-[14px] font-black uppercase tracking-tight text-center leading-[1.3] break-words"
            style={{ color: stickerTheme.text, maxWidth: '160px' }}
          >
            {storeName}
          </span>
        </div>

        <div
          className="w-full h-14 mb-4 grid place-items-center"
          style={{ borderTop: `0.1px solid ${stickerTheme.border}` }}
        >
          <span
            className="sticker-table-title block w-full text-center text-[24px] font-black uppercase tracking-tighter italic leading-none"
            style={{ color: stickerTheme.text }}
          >
            {tableName}
          </span>
        </div>

        <div className="flex flex-row items-start justify-center gap-5 w-full">
          <div className="flex flex-col items-center gap-2">
            <div className="p-2 bg-white border border-gray-200 rounded-xl">
              <img
                src={menuQrUrl}
                data-fallback-src={menuQrFallbackUrl}
                onError={onQrImageError}
                crossOrigin="anonymous"
                loading="eager"
                decoding="sync"
                referrerPolicy="no-referrer"
                className="w-20 h-20"
              />
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest italic" style={{ color: stickerTheme.text }}>
              CARDAPIO
            </span>
          </div>

          {showWifi ? (
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 bg-white border border-gray-200 rounded-xl">
                <img
                  src={wifiQrUrl}
                  data-fallback-src={wifiQrFallbackUrl}
                  onError={onQrImageError}
                  crossOrigin="anonymous"
                  loading="eager"
                  decoding="sync"
                  referrerPolicy="no-referrer"
                  className="w-20 h-20"
                />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest italic" style={{ color: stickerTheme.text }}>
                WI-FI
              </span>
            </div>
          ) : (
            <div className="w-[84px] h-[104px] rounded-xl border border-dashed border-gray-200 flex items-center justify-center px-2">
              <span className="text-[7px] font-black uppercase tracking-widest text-center leading-relaxed" style={{ color: stickerTheme.muted }}>
                Preencha SSID + senha para QR Wi-Fi
              </span>
            </div>
          )}
        </div>

        <div className="text-center mt-auto pt-4 pb-2">
          <p className="text-[7px] font-black uppercase tracking-[0.35em] italic leading-[1.2] opacity-80" style={{ color: stickerTheme.muted }}>
            SCANEIE PARA PEDIR
          </p>
        </div>
      </div>
    </div>
  );
};

export default StickerCard;

