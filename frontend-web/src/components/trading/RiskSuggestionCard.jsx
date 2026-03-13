import React from 'react';

/**
 * AI-ready card for risk warning or trade suggestion. No AI logic — structure only.
 * Later: pass { type: 'risk'|'suggestion', severity, message, action } from AI service.
 */
export default function RiskSuggestionCard({ item, className = '' }) {
  const type = item?.type ?? 'suggestion';
  const severity = item?.severity ?? 'info';
  const message = typeof item === 'string' ? item : (item?.message ?? item?.text ?? '');
  const action = item?.action;

  return (
    <div className={`risk-suggestion-card risk-suggestion-card--${severity} ${className}`}>
      <span className="risk-suggestion-card__badge">{type === 'risk' ? 'Risk' : 'Suggestion'}</span>
      <p className="risk-suggestion-card__message">{message}</p>
      {action && (
        <button type="button" className="risk-suggestion-card__action">
          {typeof action === 'string' ? action : action.label ?? 'View'}
        </button>
      )}
    </div>
  );
}
