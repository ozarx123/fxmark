import React, { useMemo, memo } from 'react';

const formatMoney = (n) =>
  (n != null && Number.isFinite(n))
    ? new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    : '—';

function riskStatus(marginLevel, freeMargin, equity) {
  if (marginLevel != null) {
    if (marginLevel >= 500) return 'safe';
    if (marginLevel >= 200) return 'ok';
    if (marginLevel >= 100) return 'caution';
    return 'danger';
  }
  if (freeMargin != null && equity != null && equity > 0 && freeMargin < equity * 0.1) return 'caution';
  return 'ok';
}

const ExposureRow = memo(function ExposureRow({ symbol, exposure, pnl }) {
  const isProfit = (pnl ?? 0) >= 0;
  return (
    <div className="risk-radar__exposure-row">
      <span className="risk-radar__exposure-symbol">{symbol}</span>
      <span className={`risk-radar__exposure-pnl ${isProfit ? 'risk-radar__exposure-pnl--profit' : 'risk-radar__exposure-pnl--loss'}`}>
        {pnl != null ? `${pnl >= 0 ? '+' : ''}${Number(pnl).toFixed(2)}` : '—'}
      </span>
    </div>
  );
});

export default function RiskRadar({
  balance = 0,
  equity,
  marginUsed = 0,
  freeMargin,
  marginLevel,
  positionsWithPnl = [],
  drawdownPercent,
  className = '',
}) {
  const eq = equity ?? balance;
  const free = freeMargin ?? (eq - marginUsed);
  const level = marginLevel ?? (marginUsed > 0 ? (eq / marginUsed) * 100 : null);
  const status = riskStatus(level, free, eq);

  const exposureBySymbol = useMemo(() => {
    const bySymbol = new Map();
    positionsWithPnl.forEach((p) => {
      const sym = p.symbol ?? '—';
      const existing = bySymbol.get(sym) ?? { symbol: sym, pnl: 0 };
      existing.pnl += p.floatingPnL ?? p.floating_pnl ?? 0;
      bySymbol.set(sym, existing);
    });
    return Array.from(bySymbol.values());
  }, [positionsWithPnl]);

  const totalFloating = useMemo(
    () => positionsWithPnl.reduce((sum, p) => sum + (p.floatingPnL ?? p.floating_pnl ?? 0), 0),
    [positionsWithPnl]
  );

  return (
    <div className={`risk-radar risk-radar--${status} ${className}`}>
      <h3 className="risk-radar__title">Risk</h3>

      <div className="risk-radar__meter-wrap">
        <div
          className="risk-radar__meter-fill"
          style={{
            width: level != null ? `${Math.min(100, Math.max(0, level) / 5)}%` : '0%',
          }}
        />
        <span className="risk-radar__meter-label">
          Margin level {level != null ? `${Number(level).toFixed(1)}%` : '—'}
        </span>
      </div>

      <div className="risk-radar__grid">
        <div className="risk-radar__item">
          <span className="risk-radar__item-label">Equity</span>
          <span className="risk-radar__item-value">{formatMoney(eq)}</span>
        </div>
        <div className="risk-radar__item">
          <span className="risk-radar__item-label">Free margin</span>
          <span className="risk-radar__item-value">{formatMoney(free)}</span>
        </div>
        <div className="risk-radar__item">
          <span className="risk-radar__item-label">Used margin</span>
          <span className="risk-radar__item-value">{formatMoney(marginUsed)}</span>
        </div>
        {drawdownPercent != null && (
          <div className="risk-radar__item">
            <span className="risk-radar__item-label">Drawdown</span>
            <span className="risk-radar__item-value risk-radar__item-value--warn">
              {Number(drawdownPercent).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="risk-radar__floating">
        <span className="risk-radar__floating-label">Floating PnL</span>
        <span className={`risk-radar__floating-value ${totalFloating >= 0 ? 'risk-radar__floating-value--profit' : 'risk-radar__floating-value--loss'}`}>
          {totalFloating >= 0 ? '+' : ''}{totalFloating.toFixed(2)}
        </span>
      </div>

      {exposureBySymbol.length > 0 && (
        <div className="risk-radar__exposure">
          <div className="risk-radar__exposure-title">Exposure by symbol</div>
          {exposureBySymbol.map((e) => (
            <ExposureRow key={e.symbol} symbol={e.symbol} exposure={null} pnl={e.pnl} />
          ))}
        </div>
      )}

      <div className={`risk-radar__status risk-radar__status--${status}`}>
        {status === 'safe' && 'Account healthy'}
        {status === 'ok' && 'Normal'}
        {status === 'caution' && 'Monitor margin'}
        {status === 'danger' && 'Low margin'}
      </div>
    </div>
  );
}
