import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import AppModal from '../ui/AppModal';

type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type ConfirmState = {
  open: boolean;
  message: string;
  resolve?: (value: boolean) => void;
};

type FeedbackContextType = {
  toast: (message: string, type?: ToastType) => void;
  confirm: (message: string) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, message: '' });

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ open: true, message, resolve });
    });
  }, []);

  const handleConfirm = (value: boolean) => {
    if (confirmState.resolve) confirmState.resolve(value);
    setConfirmState({ open: false, message: '' });
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="fixed top-4 right-4 z-[12000] space-y-2 w-[min(92vw,420px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-4 py-3 text-sm font-black border shadow-lg ${
              t.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : t.type === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-gray-900 text-white border-gray-800'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      <AppModal
        open={confirmState.open}
        onClose={() => handleConfirm(false)}
        title="Confirmar Acao"
        size="sm"
        zIndex={11999}
        bodyClassName="pb-0"
        footer={
          <div className="flex gap-3">
            <button onClick={() => handleConfirm(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 font-black uppercase text-[10px] tracking-widest">
              Cancelar
            </button>
            <button onClick={() => handleConfirm(true)} className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-black uppercase text-[10px] tracking-widest">
              Confirmar
            </button>
          </div>
        }
      >
        <p className="text-sm font-bold text-gray-600 leading-relaxed">{confirmState.message}</p>
      </AppModal>
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
};
