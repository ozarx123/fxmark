import React, { useMemo } from 'react';

const formatMoney = (n) =>
  (n != null && Number.isFinite(n))
    ? new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    : '—';

export default function AnalyticsPanel({
  positionsWithPnl = [],
  history = [],
  balance = 0,
  equity,
  className = '',
}) {
  const stats = useMemo(() => {
    const floating = positionsWithPnl.reduce((sum, p) => sum + (p.floatingPnL ?? p.floating_pnl ?? 0), 0);
    const closedToday = Array.isArray(history)
      ? history.filter((h) => {
          const raw = h.closedAt ?? h.time;
          if (raw == null) return false;
          const t = raw instanceof Date ? raw : new Date(raw);
          if (isNaN(t.getTime())) return false;
          const now = new Date();
          return t.getDate() === now.getDate() && t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
        })
      : [];
    const dailyPnl = closedToday.reduce((sum, h) => sum + (h.realizedPnl ?? h.pnl ?? 0), 0);
    const openCount = positionsWithPnl.length;
    const winning = positionsWithPnl.filter((p) => (p.floatingPnL ?? p.floating_pnl ?? 0) >= 0).length;
    const losing = positionsWithPnl.filter((p) => (p.floatingPnL ?? p.floating_pnl ?? 0) < 0).length;
    const totalClosed = Array.isArray(history) ? history.length : 0;
    const winRate = totalClosed > 0
      ? (history.filter((h) => (h.realizedPnl ?? h.pnl ?? 0) >= 0).length / totalClosed * 100).toFixed(1)
      : null;

    return {
      totalFloatingPnL: floating,
      dailyPnl,
      openPositionsCount: openCount,
      winningPositionsCount: winning,
      losingPositionsCount: losing,
      winRate: winRate != null ? `${winRate}%` : '—',
      equity: equity ?? balance,
    };
  }, [positionsWithPnl, history, balance, equity]);

  return (
    <div className={`analytics-panel ${className}`}>
      <h3 className="analytics-panel__title">Analytics</h3>
      <div className="analytics-panel__grid">
        <div className="analytics-panel__card">
          <span className="analytics-panel__card-label">Floating PnL</span>
          <span className={`analytics-panel__card-value ${stats.totalFloatingPnL >= 0 ? 'analytics-panel__card-value--profit' : 'analytics-panel__card-value--loss'}`}>
            {stats.totalFloatingPnL >= 0 ? '+' : ''}{formatMoney(stats.totalFloatingPnL)}
          </span>
        </div>
        <div className="analytics-panel__card">
          <span className="analytics-panel__card-label">Daily PnL</span>
          <span className={`analytics-panel__card-value ${stats.dailyPnl >= 0 ? 'analytics-panel__card-value--profit' : 'analytics-panel__card-value--loss'}`}>
            {stats.dailyPnl >= 0 ? '+' : ''}{formatMoney(stats.dailyPnl)}
          </span>
        </div>
        <div className="analytics-panel__card">
          <span className="analytics-panel__card-label">Open positions</span>
          <span className="analytics-panel__card-value">{stats.openPositionsCount}</span>
        </div>
        <div className="analytics-panel__card">
          <span className="analytics-panel__card-label">Winning</span>
          <span className="analytics-panel__card-value analytics-panel__card-value--profit">{stats.winningPositionsCount}</span>
        </div>
        <div className="analytics-panel__card">
          <span className="analytics-panel__card-label">Losing</span>
          <span className="analytics-panel__card-value analytics-panel__card-value--loss">{stats.losingPositionsCount}</span>
        </div>
        <div className="analytics-panel__card">
          <span className="analytics-panel__card-label">Win rate</span>
          <span className="analytics-panel__card-value">{stats.winRate}</span>
        </div>
      </div>
      <div className="analytics-panel__equity">
        <span className="analytics-panel__equity-label">Equity</span>
        <span className="analytics-panel__equity-value">{formatMoney(stats.equity)}</span>
      </div>
      <p className="analytics-panel__muted">Advanced analytics and charts coming soon.</p>
    </div>
  );
}
