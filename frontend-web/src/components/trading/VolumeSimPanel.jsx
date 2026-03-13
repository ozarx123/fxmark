import React, { useMemo } from 'react';

function useSimulatedVolume(symbols) {
  return useMemo(() => {
    const out = {};
    const t = Math.floor(Date.now() / 120000); // 2-min bucket
    let max = 0;
    symbols.forEach((s, i) => {
      const seed = (s.value.length * 13 + i * 17 + t) % 100;
      const v = 20 + seed;
      out[s.value] = v;
      if (v > max) max = v;
    });
    return { volumes: out, max: max || 1 };
  }, [symbols]);
}

export default function VolumeSimPanel({ symbols }) {
  const { volumes, max } = useSimulatedVolume(symbols);

  return (
    <div className="terminal-panel volume-sim-panel">
      <h3 className="terminal-panel-title">Volume (simulated)</h3>
      <p className="terminal-panel-subtitle">Relative volume by symbol</p>
      <div className="volume-bars">
        {symbols.map((s) => {
          const v = volumes[s.value] ?? 0;
          const pct = max ? (v / max) * 100 : 0;
          return (
            <div key={s.value} className="volume-bar-row">
              <span className="volume-bar-label">{s.value.replace('/', '')}</span>
              <div className="volume-bar-track">
                <div className="volume-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="volume-bar-value">{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
