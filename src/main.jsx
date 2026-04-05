import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import App, { ErrorBoundary } from './App.jsx';

// Legacy modules in /modules still reference global React.
window.React = React;

const { createRoot } = ReactDOMClient;

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<p style="padding:24px;font-family:system-ui">Missing #root.</p>';
} else {
  try {
    createRoot(rootEl).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (err) {
    console.error('[main] render failed', err);
    rootEl.innerHTML = `<pre style="padding:16px;color:#b91c1c;white-space:pre-wrap;font-size:12px;font-family:system-ui,monospace">${String(err?.stack || err)}</pre>`;
  }
}

