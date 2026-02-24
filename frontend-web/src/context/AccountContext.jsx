import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as tradingApi from '../api/tradingApi';
import * as walletApi from '../api/walletApi';

const STORAGE_KEY = 'fxmark_account';

const AccountContext = createContext(null);

function loadStoredActive() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.activeAccountId || data.activeAccountNumber || null;
  } catch {
    return null;
  }
}

function saveStoredActive(activeAccountId, activeAccountNumber) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeAccountId: activeAccountId || null,
      activeAccountNumber: activeAccountNumber || null,
    }));
  } catch (e) {
    console.warn('account localStorage setItem failed', e);
  }
}

export function AccountProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccountState] = useState(null);
  const [liveBalance, setLiveBalanceState] = useState(0);
  const [liveHasFunds, setLiveHasFundsState] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAccounts = useCallback(async () => {
    try {
      const list = await tradingApi.listTradingAccounts();
      const arr = Array.isArray(list) ? list : (list?.accounts ?? []);
      setAccounts(arr);
      return arr;
    } catch (e) {
      console.warn('Failed to load trading accounts', e);
      setAccounts([]);
      return [];
    }
  }, []);

  const refreshLiveBalance = useCallback(async () => {
    try {
      const bal = await walletApi.getBalance('USD');
      setLiveBalanceState(bal?.balance ?? 0);
      setLiveHasFundsState((bal?.balance ?? 0) > 0);
    } catch {
      setLiveBalanceState(0);
      setLiveHasFundsState(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await refreshAccounts();
      if (cancelled) return;
      await refreshLiveBalance();
      if (cancelled) return;
      const stored = loadStoredActive();
      let active = null;
      if (stored && list?.length) {
        active = list.find((a) => a.id === stored || a.accountNumber === stored) || list[0];
      } else if (list?.length) {
        active = list[0];
      }
      if (active) {
        setActiveAccountState(active);
        saveStoredActive(active.id, active.accountNumber);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, refreshAccounts, refreshLiveBalance]);

  const setActiveAccount = useCallback((account) => {
    if (!account) return;
    setActiveAccountState(account);
    saveStoredActive(account.id, account.accountNumber);
  }, []);

  const refreshActiveBalance = useCallback(async () => {
    if (!activeAccount?.id) return;
    try {
      const a = await tradingApi.getTradingAccount(activeAccount.id);
      if (a && activeAccount.type === 'demo') {
        setActiveAccountState((prev) => (prev?.id === a.id ? { ...prev, balance: a.balance } : prev));
        setAccounts((prev) =>
          prev.map((x) => (x.id === a.id ? { ...x, balance: a.balance } : x))
        );
      }
    } catch {
      // ignore
    }
  }, [activeAccount?.id, activeAccount?.type]);

  const balance =
    activeAccount?.type === 'demo'
      ? (activeAccount?.balance ?? 10000)
      : liveBalance;
  const isDemo = activeAccount?.type === 'demo';
  const isDemoInactive = liveHasFunds;

  const value = {
    accounts,
    activeAccount,
    setActiveAccount,
    refreshAccounts,
    refreshActiveBalance,
    refreshLiveBalance,
    balance,
    liveBalance,
    setLiveBalance: setLiveBalanceState,
    liveHasFunds,
    setLiveHasFunds: setLiveHasFundsState,
    isDemo,
    isDemoInactive,
    loading,
  };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within AccountProvider');
  return ctx;
}
