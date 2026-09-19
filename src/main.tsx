import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initPwa } from './services/pwa';
import { logger } from './utils/logger';

// Initialize PWA lifecycle listeners
initPwa();
logger.info('App', 'Antigravity POS application initialized');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
