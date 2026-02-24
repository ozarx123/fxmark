import React, { useState } from 'react';

export default function PammAddFundsModal({ allocationId, managerName, currentBalance, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = parseFloat(amount) || 0;
    if (val <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(allocationId, val);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add funds');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add funds — {managerName}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <p className="muted" style={{ marginBottom: '1rem' }}>Current balance: ${Number(currentBalance || 0).toLocaleString()}</p>
          <label>
            <span className="form-label">Amount to add (USD)</span>
            <input
              type="number"
              min={1}
              step={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="form-input"
              placeholder="e.g. 500"
              disabled={loading}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding…' : 'Add funds'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
