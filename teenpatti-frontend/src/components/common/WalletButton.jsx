import { useEffect, useState } from 'react';
import { walletService } from '../../services/walletService.js';
import './WalletButton.css';

function shortAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletButton({ size = 'md' }) {
  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Keeps this in sync if the user switches accounts *inside* MetaMask —
    // without this, the app silently keeps signing with the old account.
    const unsubscribe = walletService.onAccountsChanged((address) => {
      setWallet(address);
      setError(null);
    });
    return unsubscribe;
  }, []);

  async function handleClick() {
    if (wallet || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const { address } = await walletService.connect();
      setWallet(address);
    } catch (err) {
      console.error('Wallet connect failed:', err);
      setWallet(null);
      setError(err.message || 'Could not connect wallet');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className={`wallet-btn-wrap wallet-btn-wrap--${size}`}>
      <button
        type="button"
        className={`wallet-btn wallet-btn--${size} ${wallet ? 'is-connected' : ''}`}
        onClick={handleClick}
        disabled={connecting}
      >
        <span className="wallet-btn__icon">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="6" width="18" height="13" rx="2.2" />
            <path d="M3 10h18" />
            <circle cx="16.5" cy="14.2" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className="wallet-btn__label">
          {wallet ? shortAddress(wallet) : connecting ? 'Connecting…' : 'Connect Wallet'}
        </span>
        <span className="wallet-btn__dot" />
      </button>
      {error && <span className="wallet-btn__error">{error}</span>}
    </div>
  );
}