import React, { useState } from 'react';

export default function PammWithdrawModal({ allocationId, managerName, maxAmount, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const max = Number(maxAmount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0.01) {
      setError('Enter a valid amount.');
      return;
    }
    if (num > max) {
      setError(`Maximum withdrawable: $${max.toFixed(2)}`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onConfirm(allocationId, num);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to withdraw');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay bullrun-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Withdraw — {managerName}</h3>
        <p className="muted">Withdrawal is sent to your Live Trading Account. Max: ${max.toFixed(2)}.</p>
        <form onSubmit={handleSubmit}>
          <div className="filter-group">
            <label>Amount (USD)</label>
            <input
              type="number"
              min="0.01"
              max={max}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="filter-input"
              placeholder={`Max ${max.toFixed(2)}`}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Withdraw'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
