// manages the wallet connection state

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  connectWallet,
  contractAddress,
  getEthBalance,
  networkInfo,
  readableError,
  walletSnapshot,
  watchWallet,
} from '../lib/contract.js';
import { ethLabel, shortAddress } from '../lib/format.js';
import { useToast } from './Toasts.jsx';
import { Button } from './ui.jsx';

const WalletContext = createContext(null);

export const useWallet = () => useContext(WalletContext);

export function WalletProvider({ children }) {
  const toast = useToast();
  const [wallet, setWallet] = useState(walletSnapshot());
  const [balanceWei, setBalanceWei] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => watchWallet(setWallet), []);

  const refreshBalance = useCallback(async () => {
    if (!wallet.account) return setBalanceWei(null);
    setBalanceWei(await getEthBalance(wallet.account));
  }, [wallet.account]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const next = await connectWallet();
      setWallet(next);
      return next;
    } catch (error) {
      toast(readableError(error), 'error');
      throw error;
    } finally {
      setConnecting(false);
    }
  }, [toast]);

  const value = {
    ...wallet,
    balanceWei,
    connecting,
    connect,
    refreshBalance,
    network: networkInfo(wallet.chainId),
    contractAddress,
    ensureConnected: async () => (wallet.account ? wallet : connect()),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletButton() {
  const { account, connect, connecting, balanceWei, network } = useWallet();

  if (!account) {
    return (
      <Button variant="ghost" size="sm" onClick={connect} busy={connecting}>
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </Button>
    );
  }

  return (
    <div className="wallet-chip">
      <span className="wallet-chip__dot" />
      <span className="wallet-chip__address mono">{shortAddress(account)}</span>
      <span className="wallet-chip__meta">
        {balanceWei !== null ? ethLabel(balanceWei, 4) : '…'} · {network.name}
      </span>
    </div>
  );
}
