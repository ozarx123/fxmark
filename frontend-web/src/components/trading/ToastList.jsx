import React, { useEffect } from 'react';

const KIND_CLASS = {
  success: 'toast-list__item--success',
  error: 'toast-list__item--error',
  warning: 'toast-list__item--warning',
  info: 'toast-list__item--info',
};

export default function ToastList({ toasts = [], onDismiss, autoDismissMs = 5000 }) {
  return (
    <div className="toast-list" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          id={t.id}
          message={t.message}
          kind={t.kind}
          onDismiss={() => onDismiss?.(t.id)}
          autoDismissMs={autoDismissMs}
        />
      ))}
    </div>
  );
}

function ToastItem({ id, message, kind, onDismiss, autoDismissMs }) {
  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return;
    const t = setTimeout(() => onDismiss(), autoDismissMs);
    return () => clearTimeout(t);
  }, [id, autoDismissMs, onDismiss]);

  return (
    <div className={`toast-list__item ${KIND_CLASS[kind] || ''}`}>
      <span className="toast-list__message">{message}</span>
      <button type="button" className="toast-list__close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
