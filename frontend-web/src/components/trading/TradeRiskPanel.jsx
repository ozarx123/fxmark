import React from 'react';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function TradeRiskPanel({ equity, margin, profit, positions }) {
  const freeMargin = equity - margin;
  const marginLevelPct = margin > 0 ? (equity / margin) * 100 : 0;
  const positionCount = positions?.length ?? 0;
  const maxRiskLevel = marginLevelPct >= 500 ? 'low' : marginLevelPct >= 200 ? 'medium' : marginLevelPct >= 100 ? 'high' : 'critical';

  return (
    <div className="terminal-panel trade-risk-panel">
      <h3 className="terminal-panel-title">Trade Risk Analysis</h3>
      <div className="risk-metrics">
        <div className="risk-row">
          <span className="risk-label">Equity</span>
          <span className="risk-value">{formatCurrency(equity)}</span>
        </div>
        <div className="risk-row">
          <span className="risk-label">Margin used</span>
          <span className="risk-value">{formatCurrency(margin)}</span>
        </div>
        <div className="risk-row">
          <span className="risk-label">Free margin</span>
          <span className={`risk-value ${freeMargin >= 0 ? '' : 'negative'}`}>{formatCurrency(freeMargin)}</span>
        </div>
        <div className="risk-row">
          <span className="risk-label">Margin level</span>
          <span className={`risk-value risk-level--${maxRiskLevel}`}>
            {margin > 0 ? `${marginLevelPct.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="risk-row">
          <span className="risk-label">Open positions</span>
          <span className="risk-value">{positionCount}</span>
        </div>
        <div className="risk-row">
          <span className="risk-label">Unrealized P&amp;L</span>
          <span className={`risk-value ${(profit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
            {(profit ?? 0) >= 0 ? '+' : ''}{formatCurrency(profit ?? 0)}
          </span>
        </div>
      </div>
      <div className={`risk-badge risk-badge--${maxRiskLevel}`}>
        Risk: {maxRiskLevel === 'low' ? 'Low' : maxRiskLevel === 'medium' ? 'Medium' : maxRiskLevel === 'high' ? 'High' : 'Critical'}
      </div>
    </div>
  );
}
