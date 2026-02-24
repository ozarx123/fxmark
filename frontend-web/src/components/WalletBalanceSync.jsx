import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';

/**
 * Syncs backend wallet balance to AccountContext when user is authenticated and on live account.
 * Ensures Trading page and other consumers see the correct balance without visiting Wallet first.
 */
export default function WalletBalanceSync() {
  const { isAuthenticated } = useAuth();
  const { activeAccount, refreshLiveBalance } = useAccount();

  useEffect(() => {
    if (!isAuthenticated || activeAccount?.type !== 'live') return;
    refreshLiveBalance();
  }, [isAuthenticated, activeAccount?.type, refreshLiveBalance]);

  return null;
}
