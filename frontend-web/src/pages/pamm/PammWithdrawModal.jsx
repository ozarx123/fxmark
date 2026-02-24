import React, { useState } from 'react';

export default function PammWithdrawModal({ allocationId, managerName, maxAmount, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const max = Number(maxAmount || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = parseFloat(amount) || 0;
    if (val <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (val > max) {
      setError(`Maximum: $${max.toLocaleString()}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(allocationId, val);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to withdraw');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Withdraw — {managerName}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <p className="muted" style={{ marginBottom: '1rem' }}>Available: ${max.toLocaleString()}</p>
          <label>
            <span className="form-label">Amount to withdraw (USD)</span>
            <input
              type="number"
              min={1}
              max={max}
              step={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="form-input"
              placeholder={`Max ${max}`}
              disabled={loading}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Processing…' : 'Withdraw'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
