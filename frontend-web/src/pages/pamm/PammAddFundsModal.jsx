import React, { useState } from 'react';

export default function PammAddFundsModal({ allocationId, managerName, currentBalance, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 1) {
      setError('Enter a valid amount (min 1 USD).');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onConfirm(allocationId, num);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add funds');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay bullrun-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Add funds — {managerName}</h3>
        <p className="muted">Current balance: ${Number(currentBalance || 0).toFixed(2)}. Funds are taken from your Live Trading Account.</p>
        <form onSubmit={handleSubmit}>
          <div className="filter-group">
            <label>Amount (USD)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="filter-input"
              placeholder="e.g. 500"
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Add funds'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
