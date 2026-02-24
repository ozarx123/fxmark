/**
 * FinanceContext — shared finance/ledger state across Dashboard, Wallet, Finance.
 * Ensures data stays in sync when deposits, withdrawals, or trades update the ledger.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import * as financeApi from '../api/financeApi';

const FinanceContext = createContext(null);

export function FinanceProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [balances, setBalances] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const [balRes, pnlRes, entriesRes] = await Promise.all([
        financeApi.getLedgerBalances().catch(() => []),
        financeApi.getPnl().catch(() => null),
        financeApi.getLedgerEntries({ limit: 50 }).catch(() => []),
      ]);
      setBalances(Array.isArray(balRes) ? balRes : []);
      setPnl(pnlRes);
      setEntries(Array.isArray(entriesRes) ? entriesRes : []);
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

  const walletBalance = balances.find((b) => b.accountCode === '1100')?.balance ?? pnl?.walletBalance ?? 0;
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
