import React, { useState, useEffect, useCallback } from 'react';
import * as tradingApi from '../../api/tradingApi';
import { useTradingSocket } from '../../services/tradingSocket';
import { useAccount } from '../../context/AccountContext';

const formatMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

export default function AccountSummary({ accountId, accountNumber, className = '' }) {
  const { balance: contextBalance } = useAccount();
  const { balanceUpdate, connected } = useTradingSocket();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const opts = { accountId, accountNumber };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await tradingApi.getAccountSummary(opts);
      setSummary(data);
    } catch (e) {
      setSummary(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accountId, accountNumber]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (balanceUpdate && (balanceUpdate.accountId === accountId || !accountId)) {
      setSummary((prev) => ({
        ...prev,
        balance: balanceUpdate.balance ?? prev?.balance,
        equity: balanceUpdate.equity ?? prev?.equity,
        marginUsed: balanceUpdate.marginUsed ?? prev?.marginUsed,
        freeMargin: balanceUpdate.freeMargin ?? prev?.freeMargin,
        marginLevel: balanceUpdate.marginLevel ?? prev?.marginLevel,
      }));
    }
  }, [balanceUpdate, accountId]);

  const balance = summary?.balance ?? balanceUpdate?.balance ?? contextBalance ?? 0;
  const equity = summary?.equity ?? balanceUpdate?.equity ?? balance;
  const marginUsed = summary?.marginUsed ?? balanceUpdate?.marginUsed ?? 0;
  const freeMargin = summary?.freeMargin ?? balanceUpdate?.freeMargin ?? equity - marginUsed;
  const marginLevel = summary?.marginLevel ?? balanceUpdate?.marginLevel ?? (marginUsed > 0 ? (equity / marginUsed) * 100 : null);

  return (
    <div className={`terminal-account-summary ${className}`}>
      <div className="terminal-account-summary__row">
        <span className="terminal-account-summary__label">Balance</span>
        <span className="terminal-account-summary__value">{loading ? '…' : formatMoney(balance)}</span>
      </div>
      <div className="terminal-account-summary__row">
        <span className="terminal-account-summary__label">Equity</span>
        <span className="terminal-account-summary__value">{loading ? '…' : formatMoney(equity)}</span>
      </div>
      <div className="terminal-account-summary__row">
        <span className="terminal-account-summary__label">Margin used</span>
        <span className="terminal-account-summary__value">{loading ? '…' : formatMoney(marginUsed)}</span>
      </div>
      <div className="terminal-account-summary__row">
        <span className="terminal-account-summary__label">Free margin</span>
        <span className="terminal-account-summary__value">{loading ? '…' : formatMoney(freeMargin)}</span>
      </div>
      <div className="terminal-account-summary__row">
        <span className="terminal-account-summary__label">Margin level</span>
        <span className="terminal-account-summary__value">
          {loading ? '…' : marginLevel != null ? `${Number(marginLevel).toFixed(1)}%` : '—'}
        </span>
      </div>
      {connected && (
        <span className="terminal-account-summary__live" title="Live updates">●</span>
      )}
      {error && <p className="terminal-account-summary__error">{error}</p>}
    </div>
  );
}
