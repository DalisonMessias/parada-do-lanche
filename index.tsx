
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FeedbackProvider } from './components/feedback/FeedbackProvider';
import AppErrorBoundary from './components/AppErrorBoundary';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const error = event.error as Error | undefined;
    console.error('[GLOBAL_ERROR]', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    console.error('[GLOBAL_UNHANDLED_REJECTION]', reason);
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <FeedbackProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </FeedbackProvider>
  </React.StrictMode>
);
