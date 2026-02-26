/**
 * FinanceContext — shared finance/ledger state across Dashboard, Wallet, Finance.
 * Uses wallet API as single source of truth for balance/equity display.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import * as financeApi from '../api/financeApi';
import * as walletApi from '../api/walletApi';

const FinanceContext = createContext(null);

export function FinanceProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [balances, setBalances] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [entries, setEntries] = useState([]);
  const [walletBalanceFromApi, setWalletBalanceFromApi] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const [balRes, pnlRes, entriesRes, walletRes] = await Promise.all([
        financeApi.getLedgerBalances().catch(() => []),
        financeApi.getPnl().catch(() => null),
        financeApi.getLedgerEntries({ limit: 50 }).catch(() => []),
        walletApi.getBalance('USD').catch(() => null),
      ]);
      setBalances(Array.isArray(balRes) ? balRes : []);
      setPnl(pnlRes);
      setEntries(Array.isArray(entriesRes) ? entriesRes : []);
      setWalletBalanceFromApi(walletRes?.balance ?? 0);
    } catch (e) {
      setError(e.message || 'Failed to load finance');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch when tab becomes visible (e.g. user returns from another tab after deposit)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isAuthenticated, load]);

  // Single source of truth: wallet API (wallets collection). Matches Trading page equity & Wallet page.
  const walletBalance = walletBalanceFromApi != null ? walletBalanceFromApi : (pnl?.walletBalance ?? 0);
  const realizedPnl = pnl?.realized ?? 0;

  const value = {
    balances,
    pnl,
    entries,
    walletBalance,
    realizedPnl,
    loading,
    error,
    refresh: load,
  };

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
}
