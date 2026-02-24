import React, { useState } from 'react';
import { ProfileAvatar } from '../../components/ui';

export default function PammFollowModal({ managerName, managerId, onConfirm, onClose }) {
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
      await onConfirm(managerId, val);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to follow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-with-avatar">
            <ProfileAvatar name={managerName} size={48} verified />
            <h2>Follow {managerName}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            <span className="form-label">Amount to allocate (USD)</span>
            <input
              type="number"
              min={1}
              step={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="form-input"
              placeholder="e.g. 1000"
              disabled={loading}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Following…' : 'Follow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
