import React, { useState } from 'react';

export default function PammUnfollowModal({ managerName, onConfirm, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to unfollow');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay bullrun-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Unfollow {managerName}</h3>
        <p className="muted">Your full allocation balance will be returned to your Live Trading Account. This cannot be undone for the current allocation.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-outline-danger" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Processing…' : 'Unfollow'}
          </button>
        </div>
      </div>
    </div>
  );
}
