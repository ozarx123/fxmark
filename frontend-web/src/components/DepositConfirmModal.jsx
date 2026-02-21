import React, { useState } from 'react';

const GATEWAYS = [
  { value: 'stripe', label: 'Card (Stripe)' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'bank', label: 'Bank transfer' },
];

const CURRENCIES = [{ value: 'USD', label: 'USD' }];

const MIN_DEPOSIT = 20;
const MAX_DEPOSIT = 100000;

export default function DepositConfirmModal({ isOpen, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [gateway, setGateway] = useState('stripe');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num < MIN_DEPOSIT) {
      setError(`Minimum deposit is ${MIN_DEPOSIT} USD.`);
      return;
    }
    if (num > MAX_DEPOSIT) {
      setError(`Maximum deposit is ${MAX_DEPOSIT} USD.`);
      return;
    }
    if (!agreeTerms) {
      setError('Please agree to the terms and conditions.');
      return;
    }
    onConfirm({ amount: num, currency, gateway });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog deposit-withdraw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Deposit – confirm</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="deposit-confirm-form">
          <label>
            <span className="form-label">Amount</span>
            <input
              type="number"
              min={MIN_DEPOSIT}
              max={MAX_DEPOSIT}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="form-input"
              placeholder="e.g. 500"
              required
            />
            <span className="form-hint">Min {MIN_DEPOSIT} – Max {MAX_DEPOSIT} USD</span>
          </label>
          <label>
            <span className="form-label">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="form-input">
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Payment method</span>
            <select value={gateway} onChange={(e) => setGateway(e.target.value)} className="form-input">
              {GATEWAYS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <label className="form-checkbox-label checkbox-label">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
            />
            <span>I agree to the deposit terms and will be redirected to the payment gateway to complete the transaction.</span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm & go to payment</button>
          </div>
        </form>
      </div>
    </div>
  );
}
