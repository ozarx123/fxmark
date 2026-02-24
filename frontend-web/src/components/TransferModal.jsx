import React, { useState } from 'react';
import { formatCurrency } from '../constants/finance';
import * as walletApi from '../api/walletApi';

const MIN_TRANSFER = 10;
const MAX_TRANSFER = 50_000;

export default function TransferModal({ isOpen, availableBalance = 0, onSuccess, onClose }) {
  const [amount, setAmount] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const maxAllowed = Math.min(MAX_TRANSFER, availableBalance);
  const amountNum = parseFloat(amount);
  const isValidAmount = !isNaN(amountNum) && amountNum >= MIN_TRANSFER && amountNum <= maxAllowed;

  const reset = () => {
    setAmount('');
    setAccountNo('');
    setEmail('');
    setName('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isValidAmount) {
      setError(`Amount must be between ${formatCurrency(MIN_TRANSFER)} and ${formatCurrency(maxAllowed)}.`);
      return;
    }
    if (amountNum > availableBalance) {
      setError('Amount exceeds available balance.');
      return;
    }
    if (!accountNo?.trim() || !email?.trim() || !name?.trim()) {
      setError('Account number, email, and name are required.');
      return;
    }
    setLoading(true);
    try {
      await walletApi.executeTransfer({
        type: 'internal',
        recipientAccountNoOrEmail: accountNo.trim() || email.trim(),
        amount: amountNum,
        currency: 'USD',
        verification: {
          accountNo: accountNo.trim(),
          email: email.trim().toLowerCase(),
          name: name.trim(),
        },
      });
      reset();
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-dialog transfer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="transfer-modal-header transfer-modal-branded">
          <h2>Transfer</h2>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit} className="transfer-form">
          <div className="transfer-form-section">
            <span className="transfer-form-label">Available</span>
            <span className="transfer-form-value">{formatCurrency(availableBalance)}</span>
          </div>

          <div className="transfer-form-field">
            <label className="transfer-label">Amount (USD)</label>
            <input
              type="number"
              min={MIN_TRANSFER}
              max={maxAllowed}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="transfer-input"
              placeholder="0.00"
              required
            />
            <span className="transfer-hint">Min {formatCurrency(MIN_TRANSFER)}</span>
          </div>

          <div className="transfer-form-field">
            <label className="transfer-label">Account number</label>
            <input
              type="text"
              value={accountNo}
              onChange={(e) => setAccountNo(e.target.value)}
              className="transfer-input"
              placeholder="FX12345678"
              required
            />
          </div>

          <div className="transfer-form-field">
            <label className="transfer-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="transfer-input"
              placeholder="recipient@example.com"
              required
            />
          </div>

          <div className="transfer-form-field">
            <label className="transfer-label">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="transfer-input"
              placeholder="John Doe"
              required
            />
          </div>

          {error && <p className="transfer-error">{error}</p>}

          <div className="transfer-actions">
            <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !isValidAmount}>
              {loading ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
