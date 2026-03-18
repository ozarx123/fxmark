import React from 'react';

const formatMoney = (n) =>
  (n != null && Number.isFinite(n)) ? Number(n).toFixed(2) : '—';

export default function RiskSectionMobile({
  equity,
  freeMargin,
  marginUsed,
  marginLevel,
  hasPositions,
  className = '',
}) {
  if (!hasPositions) return null;

  const level = marginLevel != null && Number.isFinite(marginLevel) ? Number(marginLevel) : null;
  const safe = level != null && level >= 150;
  const danger = level != null && level < 100;
  const pct = Math.min(100, Math.max(0, level != null ? level : 0));

  return (
    <div className={`risk-section-mobile ${className}`}>
      <div className="risk-section-mobile__row">
        <span className="risk-section-mobile__label">Equity</span>
        <span className="risk-section-mobile__value">${formatMoney(equity)}</span>
      </div>
      <div className="risk-section-mobile__row">
        <span className="risk-section-mobile__label">Free margin</span>
        <span className="risk-section-mobile__value">${formatMoney(freeMargin)}</span>
      </div>
      <div className="risk-section-mobile__row">
        <span className="risk-section-mobile__label">Used margin</span>
        <span className="risk-section-mobile__value">${formatMoney(marginUsed)}</span>
      </div>
      {level != null && (
        <>
          <div className="risk-section-mobile__row">
            <span className="risk-section-mobile__label">Margin level</span>
            <span className={`risk-section-mobile__value risk-section-mobile__value--${danger ? 'danger' : safe ? 'safe' : ''}`}>
              {formatMoney(level)}%
            </span>
          </div>
          <div className="risk-section-mobile__bar-wrap">
            <div
              className={`risk-section-mobile__bar risk-section-mobile__bar--${danger ? 'danger' : safe ? 'safe' : 'warn'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
