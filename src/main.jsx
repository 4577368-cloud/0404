import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import App, { ErrorBoundary } from './App.jsx';

// Legacy modules in /modules still reference global React.
window.React = React;

const { createRoot } = ReactDOMClient;
createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

