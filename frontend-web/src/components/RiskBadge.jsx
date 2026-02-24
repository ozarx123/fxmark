/**
 * RiskBadge — Low / Med / High + drawdown
 * Institutional design
 */
import React from 'react';

const PROFILES = {
  low: { label: 'Low', class: 'risk-badge--low' },
  mid: { label: 'Medium', class: 'risk-badge--mid' },
  high: { label: 'High', class: 'risk-badge--high' },
  conservative: { label: 'Low', class: 'risk-badge--low' },
  moderate: { label: 'Medium', class: 'risk-badge--mid' },
  aggressive: { label: 'High', class: 'risk-badge--high' },
};

export default function RiskBadge({ profile, drawdown, className = '' }) {
  const p = (profile || '').toLowerCase();
  const config = PROFILES[p] || PROFILES.mid;
  return (
    <span className={`risk-badge ${config.class} ${className}`.trim()}>
      {config.label}
      {drawdown != null && (
        <span style={{ marginLeft: '0.5rem', opacity: 0.9 }}>· {drawdown}% DD</span>
      )}
    </span>
  );
}
