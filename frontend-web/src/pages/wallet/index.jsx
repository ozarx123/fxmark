import React, { useState } from 'react';
import DepositConfirmModal from '../../components/DepositConfirmModal';
import WithdrawConfirmModal from '../../components/WithdrawConfirmModal';

const MOCK_BALANCE = 12500;

export default function Wallet() {
  const [balance, setBalance] = useState(MOCK_BALANCE);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);

  const forwardToPaymentGateway = (type, params) => {
    const query = new URLSearchParams(params).toString();
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectUrl = `${base}/gateway-redirect?type=${type}&${query}`;
    window.location.href = redirectUrl;
  };

  const handleDepositConfirm = async (data) => {
    try {
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: data.amount, currency: data.currency, gateway: data.gateway }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }
    } catch (_) {
      /* no backend */
    }
    forwardToPaymentGateway('deposit', {
      amount: data.amount,
      currency: data.currency,
      gateway: data.gateway,
    });
  };

  const handleWithdrawConfirm = async (data) => {
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: data.amount, method: data.method }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }
      if (res.ok) {
        setBalance((b) => b - data.amount);
        setWithdrawModalOpen(false);
        return;
      }
    } catch (_) {
      /* no backend */
    }
    forwardToPaymentGateway('withdraw', { amount: data.amount, method: data.method });
  };

  const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

  return (
    <div className="page wallet-page">
      <header className="page-header">
        <h1>Wallet</h1>
        <p className="page-subtitle">Balance, deposits, and withdrawals</p>
      </header>
      <section className="page-content">
        <div className="cards-row">
          <div className="card card-wide">
            <h3>Available balance</h3>
            <p className="card-value">{formatCurrency(balance)}</p>
            <div className="card-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDepositModalOpen(true)}>Deposit</button>
              <button type="button" className="btn btn-secondary" onClick={() => setWithdrawModalOpen(true)}>Withdraw</button>
            </div>
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
                <tr>
                  <td colSpan={4} className="empty-cell">No transactions yet</td>
                </tr>
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
        availableBalance={balance}
        onConfirm={handleWithdrawConfirm}
        onClose={() => setWithdrawModalOpen(false)}
      />
    </div>
  );
}
