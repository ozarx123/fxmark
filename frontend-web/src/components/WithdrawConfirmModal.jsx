import React, { useState } from 'react';

const WITHDRAW_METHODS = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'skrill', label: 'Skrill' },
];

const MIN_WITHDRAW = 50;
const MAX_WITHDRAW = 50000;

export default function WithdrawConfirmModal({ isOpen, availableBalance = 0, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num < MIN_WITHDRAW) {
      setError(`Minimum withdrawal is ${MIN_WITHDRAW} USD.`);
      return;
    }
    if (num > MAX_WITHDRAW) {
      setError(`Maximum withdrawal is ${MAX_WITHDRAW} USD.`);
      return;
    }
    if (num > availableBalance) {
      setError('Amount exceeds available balance.');
      return;
    }
    if (!agreeTerms) {
      setError('Please agree to the withdrawal terms.');
      return;
    }
    onConfirm({ amount: num, method });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog deposit-withdraw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Withdraw – confirm</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="deposit-confirm-form">
          <p className="balance-display">Available: <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(availableBalance)}</strong></p>
          <label>
            <span className="form-label">Amount (USD)</span>
            <input
              type="number"
              min={MIN_WITHDRAW}
              max={Math.min(MAX_WITHDRAW, availableBalance)}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="form-input"
              placeholder="e.g. 500"
              required
            />
            <span className="form-hint">Min {MIN_WITHDRAW} – Max {MAX_WITHDRAW} USD</span>
          </label>
          <label>
            <span className="form-label">Withdrawal method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="form-input">
              {WITHDRAW_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="form-checkbox-label checkbox-label">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
            />
            <span>I agree to the withdrawal terms. I may be redirected to the payment gateway to verify or complete the request.</span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm & proceed</button>
          </div>
        </form>
      </div>
    </div>
  );
}
