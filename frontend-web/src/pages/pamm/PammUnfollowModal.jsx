import React, { useState } from 'react';

export default function PammUnfollowModal({ managerName, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to unfollow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Unfollow {managerName}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <p>Are you sure you want to close your allocation and unfollow this fund? Your balance will be returned.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="button" className="btn btn-primary btn-danger" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Processing…' : 'Unfollow'}
          </button>
        </div>
      </div>
    </div>
  );
}
