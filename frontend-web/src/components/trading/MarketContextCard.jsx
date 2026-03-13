import React from 'react';

/**
 * AI-ready card for market context summary. No AI logic — structure only.
 * Later: pass { session, trend, volatility, keyLevels } from AI service.
 */
export default function MarketContextCard({ context, className = '' }) {
  const content = context == null
    ? null
    : typeof context === 'string'
      ? context
      : context.summary ?? context.text ?? JSON.stringify(context);
  const session = context?.session;
  const trend = context?.trend;

  return (
    <div className={`market-context-card ${className}`}>
      <h4 className="market-context-card__title">Market context</h4>
      {session && <span className="market-context-card__session">{session}</span>}
      {trend && <span className="market-context-card__trend">{trend}</span>}
      {content ? <p className="market-context-card__body">{content}</p> : <p className="market-context-card__placeholder">Context will appear when AI is enabled.</p>}
    </div>
  );
}
