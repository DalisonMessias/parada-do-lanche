import React from 'react';
import { StoreSettings } from '../types';

const UAITECH_LOGO_URL =
  'https://obeoiqjwqchwedeupngc.supabase.co/storage/v1/object/public/assets/logos/534545345.png';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  leadingAction?: React.ReactNode;
  actions?: React.ReactNode;
  isAdmin?: boolean;
  wide?: boolean;
  settings?: StoreSettings | null;
  showFooter?: boolean;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  title,
  showBackButton,
  onBack,
  leadingAction,
  actions,
  isAdmin,
  wide,
  settings,
  showFooter,
}) => {
  const primaryColor = '#dbd114';
  const storeName = 'Parada do Lanche';
  const currentYear = new Date().getFullYear();
  const shouldRenderFooter = showFooter ?? !isAdmin;
  const adminHeaderOffsetClass = isAdmin ? 'pt-[73px]' : '';
  const shellClass = isAdmin
    ? 'w-full'
    : wide
      ? 'w-full max-w-6xl mx-auto bg-white border-x border-gray-100'
      : 'max-w-md mx-auto bg-white border-x border-gray-100';

  return (
    <div className={`min-h-screen flex flex-col bg-gray-50 relative overflow-x-hidden ${shellClass}`} style={{ '--primary': primaryColor } as any}>
      <header className={`${isAdmin ? 'fixed top-0 left-0 right-0 z-[120]' : 'sticky top-0 z-50'} bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          {leadingAction}
          {showBackButton && (
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} className="h-10 object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-lg" style={{ backgroundColor: primaryColor }}>
                {storeName.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-lg font-black text-gray-900 uppercase tracking-tighter leading-none">
                {title || storeName}
              </h1>
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] leading-none mt-1" style={{ color: primaryColor }}>
                {isAdmin ? 'Gestao Interna' : 'Menu Digital'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
            title="Recarregar pagina"
            aria-label="Recarregar pagina"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg>
          </button>
          {actions}
        </div>
      </header>

      <main className={`flex-1 ${isAdmin ? 'bg-gray-50/30' : ''} ${adminHeaderOffsetClass}`}>
        {children}
      </main>

      {shouldRenderFooter && (
        <footer className="border-t border-gray-100 bg-white px-4 py-3 text-center">
          <img src={UAITECH_LOGO_URL} alt="Logo UaiTech" className="h-5 w-auto mx-auto" />
          <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">© {currentYear}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-500">
                  Dalison Messias
                </p>
        </footer>
      )}

      <style>{`
        :root { --primary: ${primaryColor}; }
        .bg-primary { background-color: var(--primary); }
        .text-primary { color: var(--primary); }
        .border-primary { border-color: var(--primary); }
        input, select, textarea { border-color: #e5e7eb !important; border-width: 1px !important; }
        input[type="checkbox"] {
          -webkit-appearance: none;
          appearance: none;
          width: 42px;
          height: 24px;
          border-radius: 9999px;
          border: 1px solid #d1d5db;
          background: #e5e7eb;
          position: relative;
          cursor: pointer;
          transition: all 0.2s ease;
          flex: 0 0 auto;
        }
        input[type="checkbox"]::before {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25);
          transition: transform 0.2s ease;
        }
        input[type="checkbox"]:checked {
          background: var(--primary);
          border-color: var(--primary);
        }
        input[type="checkbox"]:checked::before {
          transform: translateX(18px);
        }
        input[type="checkbox"]:focus-visible {
          outline: 2px solid rgba(219, 209, 20, 0.45);
          outline-offset: 2px;
        }
        input[type="checkbox"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default Layout;
