import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../../context/AccountContext';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../hooks/useFinance';
import DepositConfirmModal from '../../components/DepositConfirmModal';
import WithdrawConfirmModal from '../../components/WithdrawConfirmModal';
import TransferModal from '../../components/TransferModal';
import * as walletApi from '../../api/walletApi';
import { formatCurrency } from '../../constants/finance';

export default function Wallet() {
  const { activeAccount, balance, refreshLiveBalance } = useAccount();
  const { isAuthenticated } = useAuth();
  const { refresh: refreshFinance } = useFinance();
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const [walletBalance, setWalletBalance] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadWalletData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const [balRes, depRes, wdRes, tradesRes, transfersRes] = await Promise.all([
        walletApi.getBalance().catch(() => null),
        walletApi.listDeposits().catch(() => []),
        walletApi.listWithdrawals().catch(() => []),
        walletApi.listTrades().catch(() => []),
        walletApi.listTransfers().catch(() => []),
      ]);
      if (balRes) {
        const bal = balRes.balance ?? 0;
        setWalletBalance(bal);
        refreshLiveBalance();
      }
      setDeposits(Array.isArray(depRes) ? depRes : []);
      setWithdrawals(Array.isArray(wdRes) ? wdRes : []);
      setTrades(Array.isArray(tradesRes) ? tradesRes : []);
      setTransfers(Array.isArray(transfersRes) ? transfersRes : []);
      refreshFinance();
    } catch (e) {
      setError(e.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, refreshLiveBalance, refreshFinance]);

  useEffect(() => {
    loadWalletData();
  }, [loadWalletData]);

  // Refresh when user returns to tab (e.g. after closing a position on trading page)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        loadWalletData();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isAuthenticated, loadWalletData]);

  const displayBalance = isAuthenticated && activeAccount?.type === 'live' && walletBalance != null
    ? walletBalance
    : balance;

  const handleDepositConfirm = async (data) => {
    if (!isAuthenticated) return;
    setError('');
    try {
      const { id } = await walletApi.createDeposit({
        amount: data.amount,
        currency: data.currency,
        gateway: data.gateway,
      });
      await walletApi.confirmDeposit(id);
      setDepositModalOpen(false);
      loadWalletData();
      refreshFinance();
    } catch (e) {
      setError(e.message || 'Failed to deposit');
    }
  };

  const handleWithdrawConfirm = async (data) => {
    if (!isAuthenticated) return;
    setError('');
    try {
      const { id } = await walletApi.requestWithdrawal({
        amount: data.amount,
        currency: 'USD',
        method: data.method,
      });
      await walletApi.processWithdrawal(id);
      setWithdrawModalOpen(false);
      loadWalletData();
      refreshFinance();
    } catch (e) {
      setError(e.message || 'Failed to withdraw');
    }
  };

  const transactions = [
    ...deposits.map((t) => ({ ...t, displayType: 'Deposit', type: 'deposit' })),
    ...withdrawals.map((t) => ({ ...t, displayType: 'Withdrawal', type: 'withdrawal' })),
    ...trades.map((t) => ({ ...t, displayType: (t.amount ?? 0) >= 0 ? 'Trade profit' : 'Trade loss', type: 'trade' })),
    ...transfers.map((t) => ({ ...t, displayType: (t.amount ?? 0) >= 0 ? 'Transfer in' : 'Transfer out', type: t.type })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="page wallet-page">
      <header className="page-header">
        <div>
          <h1>Wallet</h1>
          <p className="page-subtitle">Balance, deposits, and withdrawals · {activeAccount?.type === 'demo' ? 'Demo' : 'Live'} account</p>
        </div>
        <div className="page-header-actions">
          <Link to="/finance" className="btn btn-secondary btn-sm">View ledger</Link>
        </div>
      </header>
      <section className="page-content">
        {error && <p className="form-error">{error}</p>}
        <div className="wallet-cards">
          <div className="card wallet-balance-card">
            <h3>Available balance</h3>
            <p className="card-value">
              {loading && isAuthenticated ? '…' : formatCurrency(displayBalance)}
            </p>
            <div className="card-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDepositModalOpen(true)}
                disabled={!isAuthenticated}
              >
                Deposit
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setWithdrawModalOpen(true)}
                disabled={!isAuthenticated}
              >
                Withdraw
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTransferModalOpen(true)}
                disabled={!isAuthenticated}
              >
                Transfer
              </button>
            </div>
            {!isAuthenticated && <p className="muted" style={{ marginTop: '0.5rem' }}>Sign in to deposit or withdraw</p>}
          </div>
          <div className="card wallet-transfer-card">
            <h3>Internal & external transfer</h3>
            <p className="card-label">Move funds between trade wallets</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTransferModalOpen(true)}
              disabled={!isAuthenticated}
            >
              Transfer funds
            </button>
          </div>
        </div>
        <div className="section-block">
          <h2>Recent transactions</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!isAuthenticated ? (
                  <tr><td colSpan={4} className="empty-cell">Sign in to view transactions</td></tr>
                ) : loading ? (
                  <tr><td colSpan={4} className="empty-cell">Loading…</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={4} className="empty-cell">No transactions yet</td></tr>
                ) : (
                  transactions.slice(0, 20).map((t) => (
                    <tr key={`${t.type}-${t.id}`}>
                      <td>{formatDate(t.createdAt)}</td>
                      <td>{t.displayType || t.type}</td>
                      <td className={(t.type === 'withdrawal' || (t.type === 'trade' && (t.amount ?? 0) < 0)) ? 'negative' : 'positive'}>
                        {(t.type === 'withdrawal' || (t.type === 'trade' && (t.amount ?? 0) < 0)) ? '-' : '+'}
                        {formatCurrency(Math.abs(t.amount ?? 0), t.currency)}
                      </td>
                      <td>
                        <span className={`status-badge status-${t.status || 'pending'}`}>
                          {t.status || 'pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <DepositConfirmModal
        isOpen={depositModalOpen}
        onConfirm={handleDepositConfirm}
        onClose={() => setDepositModalOpen(false)}
      />
      <WithdrawConfirmModal
        isOpen={withdrawModalOpen}
        availableBalance={displayBalance}
        onConfirm={handleWithdrawConfirm}
        onClose={() => setWithdrawModalOpen(false)}
      />
      <TransferModal
        isOpen={transferModalOpen}
        availableBalance={displayBalance}
        onSuccess={loadWalletData}
        onClose={() => setTransferModalOpen(false)}
      />
    </div>
  );
}
