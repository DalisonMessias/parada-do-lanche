
import React from 'react';
import { StoreSettings } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
  isAdmin?: boolean;
  wide?: boolean;
  settings?: StoreSettings | null;
}

const Layout: React.FC<LayoutProps> = ({ children, title, showBackButton, onBack, actions, isAdmin, wide, settings }) => {
  const primaryColor = settings?.primary_color || '#f97316';
  const currentYear = new Date().getFullYear();
  const shellClass = isAdmin
    ? 'w-full'
    : wide
      ? 'w-full max-w-6xl mx-auto bg-white border-x border-gray-100'
      : 'max-w-md mx-auto bg-white border-x border-gray-100';
  
  return (
    <div className={`min-h-screen flex flex-col bg-gray-50 relative overflow-x-hidden ${shellClass}`} style={{ '--primary': primaryColor } as any}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} className="w-9 h-9 rounded-lg object-cover border border-gray-100" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-lg" style={{ backgroundColor: primaryColor }}>
                {settings?.store_name?.substring(0, 2).toUpperCase() || 'PL'}
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-lg font-black text-gray-900 uppercase tracking-tighter leading-none">
                {title || settings?.store_name || 'Parada do Lanche'}
              </h1>
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] leading-none mt-1" style={{ color: primaryColor }}>
                {isAdmin ? 'Gestão Interna' : 'Menu Digital'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
            title="Recarregar página"
            aria-label="Recarregar página"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg>
          </button>
          {actions}
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 ${isAdmin ? 'bg-gray-50/30' : ''}`}>
        {children}
      </main>

      <footer className="border-t border-gray-100 bg-white px-4 py-3 text-center">
        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
          Dalison Messias - Uai Tech © {currentYear}
        </p>
        <p className="mt-1 inline-flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-500">
          Feito com amor
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="#ef4444"
            aria-hidden="true"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </p>
      </footer>

      <style>{`
        :root { --primary: ${primaryColor}; }
        .bg-primary { background-color: var(--primary); }
        .text-primary { color: var(--primary); }
        .border-primary { border-color: var(--primary); }
        input, select, textarea { border-color: #e5e7eb !important; border-width: 1px !important; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default Layout;
