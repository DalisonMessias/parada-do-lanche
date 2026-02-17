import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[APP_ERROR_BOUNDARY] Render failure', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="w-full max-w-xl bg-white border border-red-200 rounded-2xl p-6 space-y-4">
            <h1 className="text-base font-black text-red-700 uppercase tracking-widest">
              Falha ao carregar a tela
            </h1>
            <p className="text-sm text-gray-700 font-bold">
              Abra o console do navegador para ver o erro detalhado.
            </p>
            <pre className="text-xs bg-red-50 border border-red-100 rounded-xl p-3 overflow-x-auto text-red-700 whitespace-pre-wrap break-words">
              {this.state.error.message || 'Erro desconhecido'}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
