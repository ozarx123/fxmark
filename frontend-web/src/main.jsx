import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './styles/index.css';
import './styles/design-system.css';
import { liftPasswordResetHashFromUrl } from './utils/resetPasswordHashLift.js';

liftPasswordResetHashFromUrl();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
