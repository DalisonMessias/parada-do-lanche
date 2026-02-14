import React, { useEffect } from 'react';

type AppModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface AppModalProps {
  open: boolean;
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: AppModalSize;
  zIndex?: number;
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
  panelClassName?: string;
  hideCloseButton?: boolean;
}

const sizeClassMap: Record<AppModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  xl: 'sm:max-w-6xl',
  '2xl': 'sm:max-w-7xl',
};

const AppModal: React.FC<AppModalProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  zIndex = 200,
  closeOnBackdrop = true,
  bodyClassName = '',
  panelClassName = '',
  hideCloseButton = false,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm p-0 sm:p-4 flex items-end sm:items-center justify-center"
      style={{ zIndex }}
      onMouseDown={(event) => {
        if (!closeOnBackdrop) return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full h-full sm:h-auto sm:max-h-[calc(100dvh-2rem)] bg-white rounded-none sm:rounded-[30px] border-0 sm:border border-gray-200 flex flex-col overflow-hidden ${sizeClassMap[size]} ${panelClassName}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 sticky top-0 z-10 bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {typeof title === 'string' ? (
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter text-gray-900">{title}</h3>
            ) : (
              title
            )}
          </div>
          {!hideCloseButton && (
            <button onClick={onClose} className="bg-gray-50 p-2.5 rounded-xl text-gray-400 shrink-0" aria-label="Fechar modal">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className={`flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 ${bodyClassName}`}>{children}</div>

        {footer && (
          <div className="shrink-0 sticky bottom-0 z-10 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppModal;
