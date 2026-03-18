import React, { useState } from 'react';

const DISCLAIMER_TEXT = `Investor Terms & Conditions and risk disclosure apply. Trading involves risk of loss. Past performance is not indicative of future results. For further information, please contact us or refer to our terms and risk disclosures.`;

export default function PammTermsModal({ fundName, onAccept, onClose, onViewDisclaimer }) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const handleAccept = async () => {
    if (!checked) return;
    setError('');
    setSubmitting(true);
    try {
      await onAccept();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to accept terms');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDisclaimer = () => {
    if (onViewDisclaimer) {
      onViewDisclaimer();
    } else {
      setShowDisclaimer(true);
    }
  };

  return (
    <div className="modal-overlay bullrun-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Investor Terms & Conditions</h3>
        <p className="muted">Before following {fundName || 'this fund'}, please read and accept the terms.</p>

        <div className="filter-group">
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ marginTop: '0.25rem' }}
            />
            <span>I have read and accept the Investor Terms & Conditions</span>
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={handleViewDisclaimer}>
            View Disclaimer
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!checked || submitting}
            onClick={handleAccept}
          >
            {submitting ? 'Submitting…' : 'Accept & Continue'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      {showDisclaimer && (
        <div className="modal-overlay bullrun-modal" onClick={() => setShowDisclaimer(false)} style={{ zIndex: 1001 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '28rem' }}>
            <h3>Disclaimer</h3>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{DISCLAIMER_TEXT}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setShowDisclaimer(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
