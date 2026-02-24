/**
 * MetricCard — value + delta + optional sparkline
 * Institutional + Futuristic design
 */
import React from 'react';

export default function MetricCard({ title, value, delta, deltaPositive, sparklineData, className = '' }) {
  return (
    <div className={`glass-card metric-card pamm-card ${className}`.trim()}>
      <h3 className="pamm-card h3" style={{ margin: 0, marginBottom: '0.35rem' }}>{title}</h3>
      <p className={`pamm-value metric-style ${deltaPositive === true ? 'positive' : deltaPositive === false ? 'negative' : ''}`.trim()} style={{ margin: 0 }}>
        {value}
      </p>
      {delta != null && (
        <span className={`metric-delta ${deltaPositive === true ? 'positive' : deltaPositive === false ? 'negative' : ''}`.trim()}>
          {delta}
        </span>
      )}
      {sparklineData && sparklineData.length > 0 && (
        <div className="metric-sparkline" style={{ marginTop: '0.5rem', height: 32 }}>
          {/* Mini sparkline placeholder - use Recharts Sparkline if needed */}
        </div>
      )}
    </div>
  );
}
