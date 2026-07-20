import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/Toasts.jsx';
import { WalletProvider } from './components/Wallet.jsx';
import './styles/global.css';

// wraps up the app 
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
