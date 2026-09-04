import { useCallback, useEffect, useState } from 'react';
import {
  connectWallet as requestConnection,
  describeContractError,
  ensureAmoyNetwork,
  getConnectedAccount,
  getWalletChainId,
  isWalletAvailable,
} from '../services/blockchain';
import { POLYGON_AMOY_CHAIN_ID } from '../config/web3';

interface WalletState {
  account: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  hasWallet: boolean;
  isCorrectNetwork: boolean;
  connect: () => Promise<string | null>;
  switchNetwork: () => Promise<void>;
}

/**
 * Wraps the injected wallet: restores an existing connection on mount and keeps
 * account / chain state in sync with the wallet's own events.
 */
export function useWallet(): WalletState {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasWallet = isWalletAvailable();

  // Restore a previously authorised session without prompting the user.
  useEffect(() => {
    if (!hasWallet) return;

    let cancelled = false;
    (async () => {
      const [existingAccount, existingChain] = await Promise.all([
        getConnectedAccount(),
        getWalletChainId(),
      ]);
      if (cancelled) return;
      setAccount(existingAccount);
      setChainId(existingChain);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasWallet]);

  // Follow account / network changes made from inside the wallet UI.
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum?.on) return;

    const handleAccountsChanged = (accounts: string[]) => setAccount(accounts[0] ?? null);
    const handleChainChanged = (nextChainId: string) => setChainId(parseInt(nextChainId, 16));

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
      ethereum.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    setConnecting(true);
    setError(null);
    try {
      const connected = await requestConnection();
      setAccount(connected);
      setChainId(await getWalletChainId());
      return connected;
    } catch (err) {
      setError(describeContractError(err));
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await ensureAmoyNetwork();
      setChainId(await getWalletChainId());
    } catch (err) {
      setError(describeContractError(err));
    }
  }, []);

  return {
    account,
    chainId,
    connecting,
    error,
    hasWallet,
    isCorrectNetwork: chainId === POLYGON_AMOY_CHAIN_ID,
    connect,
    switchNetwork,
  };
}
