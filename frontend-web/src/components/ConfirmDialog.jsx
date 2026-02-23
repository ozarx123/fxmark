import React from 'react';

/**
 * Reusable confirmation dialog with reference details.
 * @param {boolean} isOpen
 * @param {string} title - Dialog title
 * @param {string} message - Short message (e.g. "Are you sure you want to close this position?")
 * @param {Array<{ label: string, value: string|number }>} referenceDetails - Key-value rows shown in the dialog
 * @param {string} confirmLabel - Button text (e.g. "Close position")
 * @param {string} cancelLabel - Default "Cancel"
 * @param {'primary'|'danger'} variant - Button style
 * @param {() => void} onConfirm
 * @param {() => void} onClose
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  referenceDetails = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onClose,
}) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  return (
    <div className="modal-overlay confirm-dialog-overlay" onClick={onClose}>
      <div className="modal-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="confirm-dialog-body">
          {message && <p className="confirm-dialog-message">{message}</p>}
          {referenceDetails.length > 0 && (
            <dl className="confirm-dialog-details">
              {referenceDetails.map(({ label, value }) => (
                <div key={label} className="confirm-dialog-detail-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
