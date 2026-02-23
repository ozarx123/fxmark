import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'fxmark_account';
const DEMO_BALANCE = 10000;

const AccountContext = createContext(null);

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      accountType: data.accountType === 'live' ? 'live' : 'demo',
      liveBalance: typeof data.liveBalance === 'number' ? data.liveBalance : 0,
      liveHasFunds: !!data.liveHasFunds,
    };
  } catch {
    return null;
  }
}

function saveStored(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('account localStorage setItem failed', e);
  }
}

export function AccountProvider({ children }) {
  const [accountType, setAccountTypeState] = useState('demo');
  const [liveBalance, setLiveBalanceState] = useState(0);
  const [liveHasFunds, setLiveHasFundsState] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setAccountTypeState(stored.accountType);
      setLiveBalanceState(stored.liveBalance);
      setLiveHasFundsState(stored.liveHasFunds);
    }
  }, []);

  useEffect(() => {
    saveStored({
      accountType,
      liveBalance,
      liveHasFunds,
    });
  }, [accountType, liveBalance, liveHasFunds]);

  const setAccountType = useCallback((type) => {
    setAccountTypeState(type === 'live' ? 'live' : 'demo');
  }, []);

  const setLiveBalance = useCallback((fnOrValue) => {
    setLiveBalanceState((prev) => typeof fnOrValue === 'function' ? fnOrValue(prev) : fnOrValue);
  }, []);

  const setLiveHasFunds = useCallback((value) => {
    setLiveHasFundsState((prev) => (typeof value === 'function' ? value(prev) : !!value));
  }, []);

  const balance = accountType === 'demo' ? DEMO_BALANCE : liveBalance;
  const isDemo = accountType === 'demo';
  const isDemoInactive = liveHasFunds;

  const value = {
    accountType,
    setAccountType,
    balance,
    demoBalance: DEMO_BALANCE,
    liveBalance,
    setLiveBalance,
    liveHasFunds,
    setLiveHasFunds,
    isDemo,
    isDemoInactive,
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
