import React, { useMemo } from 'react';

// Stable pseudo % change per symbol (same for 1-min window so it doesn't flicker)
function useSimulatedChange(symbols) {
  return useMemo(() => {
    const out = {};
    const t = Math.floor(Date.now() / 60000); // 1-min bucket
    symbols.forEach((s, i) => {
      const seed = (s.value.length * 7 + i * 11 + t) % 100;
      out[s.value] = ((seed - 50) / 50) * 0.5; // roughly -0.5% to +0.5%
    });
    return out;
  }, [symbols]);
}

function getHeatColor(pct) {
  if (pct >= 0.3) return 'var(--heatmap-up-strong, #166534)';
  if (pct >= 0.1) return 'var(--heatmap-up, #22c55e)';
  if (pct >= 0) return 'var(--heatmap-up-weak, #4ade80)';
  if (pct >= -0.1) return 'var(--heatmap-down-weak, #f87171)';
  if (pct >= -0.3) return 'var(--heatmap-down, #dc2626)';
  return 'var(--heatmap-down-strong, #991b1b)';
}

export default function HeatmapPanel({ symbols }) {
  const changePct = useSimulatedChange(symbols);

  return (
    <div className="terminal-panel heatmap-panel">
      <h3 className="terminal-panel-title">Heatmap</h3>
      <p className="terminal-panel-subtitle">Simulated % change (session)</p>
      <div className="heatmap-grid">
        {symbols.map((s) => {
          const pct = changePct[s.value] ?? 0;
          const color = getHeatColor(pct);
          return (
            <div
              key={s.value}
              className="heatmap-cell"
              style={{ backgroundColor: color }}
              title={`${s.value} ${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(2)}%`}
            >
              <span className="heatmap-symbol">{s.value.replace('/', '')}</span>
              <span className="heatmap-pct">{pct >= 0 ? '+' : ''}{(pct * 100).toFixed(2)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
