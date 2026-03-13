import React from 'react';
import FxChart from '../FxChart';
import { useMarketData } from '../../hooks/useMarketData';

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
];

export default function ChartWorkspace({
  symbol,
  onSymbolChange,
  symbols = [],
  timeframe: controlledTimeframe,
  onTimeframeChange,
  chartType = 'candles',
  onChartTypeChange,
  height = 400,
  positions = [],
  pendingOrders = [],
  className = '',
}) {
  const timeframe = controlledTimeframe ?? '1m';
  const { candles, tick, loading, error, wsConnected } = useMarketData(symbol, timeframe);
  const marketPrice = tick?.close ?? tick?.price ?? (candles?.length ? candles[candles.length - 1]?.close : null);

  return (
    <div className={`terminal-chart-workspace ${className}`}>
      <div className="terminal-chart-workspace__toolbar">
        <div className="terminal-chart-workspace__symbol-info">
          <span className="terminal-chart-workspace__symbol">{symbol}</span>
          {marketPrice != null && (
            <span className="terminal-chart-workspace__price">
              {Number(marketPrice).toFixed(symbol?.includes('XAU') ? 2 : 4)}
            </span>
          )}
          {wsConnected && <span className="terminal-chart-workspace__live">Live</span>}
        </div>
        <div className="terminal-chart-workspace__controls">
          {symbols.length > 0 && onSymbolChange && (
            <select
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              className="terminal-chart-workspace__select"
            >
              {symbols.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}
          {onTimeframeChange && (
            <select
              value={timeframe}
              onChange={(e) => onTimeframeChange(e.target.value)}
              className="terminal-chart-workspace__select"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          )}
          {onChartTypeChange && (
            <select
              value={chartType}
              onChange={(e) => onChartTypeChange(e.target.value)}
              className="terminal-chart-workspace__select"
            >
              <option value="candles">Candles</option>
              <option value="line">Line</option>
            </select>
          )}
        </div>
      </div>
      <FxChart
        symbol={symbol}
        height={height}
        showCandles={chartType === 'candles'}
        data={candles}
        tick={tick}
        timeframe={timeframe}
        loading={loading}
        error={error}
        wsConnected={wsConnected}
        marketPrice={marketPrice}
        positions={positions}
        pendingOrders={pendingOrders}
      />
    </div>
  );
}
