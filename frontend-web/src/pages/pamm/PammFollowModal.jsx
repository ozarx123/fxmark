import React, { useState } from 'react';

export default function PammFollowModal({ managerName, managerId, onConfirm, onClose }) {
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
      await onConfirm(managerId, num);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to follow');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay bullrun-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Follow {managerName}</h3>
        <p className="muted">Allocate from your Live Trading Account to this fund.</p>
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
              placeholder="e.g. 1000"
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Follow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
